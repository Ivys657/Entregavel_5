const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { criarBanco } = require('./db');
const { gerarToken, autenticar, autorizar } = require('./auth');

function criarApp(caminhoDb) {
  const db = criarBanco(caminhoDb);
  const app = express();
  app.use(cors());
  app.use(express.json());

  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  // ---------- Login ----------
  app.post('/api/auth/login', (req, res) => {
    const { email, senha } = req.body || {};
    if (!email || !senha) return erro(res, 400, 'Informe e-mail e senha');
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    if (!u || !bcrypt.compareSync(senha, u.senha_hash)) return erro(res, 401, 'Credenciais inválidas');
    res.json({ token: gerarToken(u), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } });
  });

  // ---------- T1: cadastro de usuário (admin) ----------
  app.post('/api/usuarios', autenticar, autorizar('admin'), (req, res) => {
    const { nome, email, senha, perfil } = req.body || {};
    if (!nome || !email || !senha || !['admin', 'caixa'].includes(perfil))
      return erro(res, 400, 'Dados inválidos (nome, email, senha, perfil admin|caixa)');
    if (senha.length < 6) return erro(res, 400, 'Senha deve ter ao menos 6 caracteres');
    try {
      const r = db.prepare('INSERT INTO usuarios (nome,email,senha_hash,perfil) VALUES (?,?,?,?)')
        .run(nome, email, bcrypt.hashSync(senha, 10), perfil);
      res.status(201).json({ id: r.lastInsertRowid, nome, email, perfil });
    } catch {
      erro(res, 409, 'E-mail já cadastrado');
    }
  });
  app.get('/api/usuarios', autenticar, autorizar('admin'), (req, res) =>
    res.json(db.prepare('SELECT id,nome,email,perfil FROM usuarios').all()));

  // ---------- T2: cadastro de produto (admin) ----------
  app.post('/api/produtos', autenticar, autorizar('admin'), (req, res) => {
    const { nome, preco, unidade = 'un', estoque = 0 } = req.body || {};
    if (!nome || typeof preco !== 'number' || preco < 0 || !Number.isInteger(estoque) || estoque < 0)
      return erro(res, 400, 'Dados inválidos (nome, preco >= 0, estoque inteiro >= 0)');
    try {
      const r = db.prepare('INSERT INTO produtos (nome,preco,unidade,estoque) VALUES (?,?,?,?)')
        .run(nome, preco, unidade, estoque);
      if (estoque > 0)
        db.prepare("INSERT INTO movimentos_estoque (produto_id,quantidade,tipo,usuario_id) VALUES (?,?, 'entrada',?)")
          .run(r.lastInsertRowid, estoque, req.usuario.id);
      res.status(201).json({ id: r.lastInsertRowid, nome, preco, unidade, estoque });
    } catch {
      erro(res, 409, 'Produto já cadastrado');
    }
  });
  app.get('/api/produtos', autenticar, (req, res) =>
    res.json(db.prepare('SELECT * FROM produtos ORDER BY nome').all()));

  // ---------- T3: entrada de estoque (admin) ----------
  app.post('/api/produtos/:id/estoque', autenticar, autorizar('admin'), (req, res) => {
    const { quantidade } = req.body || {};
    if (!Number.isInteger(quantidade) || quantidade <= 0) return erro(res, 400, 'Quantidade deve ser inteiro positivo');
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!p) return erro(res, 404, 'Produto não encontrado');
    db.transaction(() => {
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(quantidade, p.id);
      db.prepare("INSERT INTO movimentos_estoque (produto_id,quantidade,tipo,usuario_id) VALUES (?,?, 'entrada',?)")
        .run(p.id, quantidade, req.usuario.id);
    })();
    res.json({ id: p.id, estoque: p.estoque + quantidade });
  });

  // ---------- T4: registrar venda (caixa/admin) ----------
  app.post('/api/vendas', autenticar, autorizar('admin', 'caixa'), (req, res) => {
    const { itens, forma_pagamento, cliente_id = null } = req.body || {};
    if (!Array.isArray(itens) || !itens.length) return erro(res, 400, 'Informe ao menos um item');
    if (!['dinheiro', 'pix', 'cartao'].includes(forma_pagamento)) return erro(res, 400, 'Forma de pagamento inválida');
    if (cliente_id && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(cliente_id))
      return erro(res, 404, 'Cliente não encontrado');

    try {
      const vendaId = db.transaction(() => {
        let total = 0;
        const linhas = [];
        for (const it of itens) {
          if (!Number.isInteger(it.quantidade) || it.quantidade <= 0) throw { status: 400, msg: 'Quantidade inválida' };
          const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(it.produto_id);
          if (!p) throw { status: 404, msg: `Produto ${it.produto_id} não encontrado` };
          if (p.estoque < it.quantidade) throw { status: 409, msg: `Estoque insuficiente de ${p.nome}` };
          total += p.preco * it.quantidade;
          linhas.push({ p, q: it.quantidade });
        }
        const v = db.prepare('INSERT INTO vendas (usuario_id,cliente_id,forma_pagamento,total) VALUES (?,?,?,?)')
          .run(req.usuario.id, cliente_id, forma_pagamento, Math.round(total * 100) / 100);
        for (const { p, q } of linhas) {
          db.prepare('INSERT INTO itens_venda (venda_id,produto_id,quantidade,preco_unitario) VALUES (?,?,?,?)')
            .run(v.lastInsertRowid, p.id, q, p.preco);
          db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(q, p.id);
          db.prepare("INSERT INTO movimentos_estoque (produto_id,quantidade,tipo,usuario_id) VALUES (?,?, 'venda',?)")
            .run(p.id, -q, req.usuario.id);
        }
        return v.lastInsertRowid;
      })();
      const venda = db.prepare('SELECT * FROM vendas WHERE id = ?').get(vendaId);
      res.status(201).json(venda);
    } catch (e) {
      if (e.status) return erro(res, e.status, e.msg);
      throw e;
    }
  });
  app.get('/api/vendas', autenticar, (req, res) =>
    res.json(db.prepare(`
      SELECT v.*, u.nome AS atendente, c.nome AS cliente
      FROM vendas v JOIN usuarios u ON u.id = v.usuario_id
      LEFT JOIN clientes c ON c.id = v.cliente_id ORDER BY v.id DESC`).all()));

  // ---------- T5: cancelar venda (admin) ----------
  app.post('/api/vendas/:id/cancelar', autenticar, autorizar('admin'), (req, res) => {
    const v = db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.id);
    if (!v) return erro(res, 404, 'Venda não encontrada');
    if (v.status === 'cancelada') return erro(res, 409, 'Venda já cancelada');
    db.transaction(() => {
      db.prepare("UPDATE vendas SET status = 'cancelada' WHERE id = ?").run(v.id);
      for (const it of db.prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(v.id)) {
        db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(it.quantidade, it.produto_id);
        db.prepare("INSERT INTO movimentos_estoque (produto_id,quantidade,tipo,usuario_id) VALUES (?,?, 'cancelamento',?)")
          .run(it.produto_id, it.quantidade, req.usuario.id);
      }
    })();
    res.json({ id: v.id, status: 'cancelada' });
  });

  // ---------- T6: cadastro de cliente (caixa/admin) ----------
  app.post('/api/clientes', autenticar, autorizar('admin', 'caixa'), (req, res) => {
    const { nome, telefone = null, email = null } = req.body || {};
    if (!nome) return erro(res, 400, 'Nome é obrigatório');
    const r = db.prepare('INSERT INTO clientes (nome,telefone,email) VALUES (?,?,?)').run(nome, telefone, email);
    res.status(201).json({ id: r.lastInsertRowid, nome, telefone, email });
  });
  app.get('/api/clientes', autenticar, (req, res) =>
    res.json(db.prepare('SELECT * FROM clientes ORDER BY nome').all()));

  // ---------- Relatórios (admin) ----------
  app.get('/api/relatorios/vendas-por-dia', autenticar, autorizar('admin'), (req, res) => {
    const { inicio = '0000-01-01', fim = '9999-12-31' } = req.query;
    res.json(db.prepare(`
      SELECT date(data) AS dia, COUNT(*) AS vendas, ROUND(SUM(total),2) AS total
      FROM vendas WHERE status='concluida' AND date(data) BETWEEN ? AND ?
      GROUP BY date(data) ORDER BY dia`).all(inicio, fim));
  });
  app.get('/api/relatorios/mais-vendidos', autenticar, autorizar('admin'), (req, res) => {
    const n = Math.min(parseInt(req.query.n) || 5, 50);
    res.json(db.prepare(`
      SELECT p.nome, SUM(i.quantidade) AS quantidade, ROUND(SUM(i.quantidade*i.preco_unitario),2) AS receita
      FROM itens_venda i JOIN vendas v ON v.id=i.venda_id AND v.status='concluida'
      JOIN produtos p ON p.id=i.produto_id GROUP BY p.id ORDER BY quantidade DESC LIMIT ?`).all(n));
  });
  app.get('/api/relatorios/historico-cliente/:id', autenticar, autorizar('admin'), (req, res) => {
    res.json(db.prepare(`
      SELECT id, data, forma_pagamento, total, status FROM vendas
      WHERE cliente_id = ? ORDER BY data DESC`).all(req.params.id));
  });

  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ erro: 'Erro interno' }); });
  app.locals.db = db;
  return app;
}

module.exports = { criarApp };
