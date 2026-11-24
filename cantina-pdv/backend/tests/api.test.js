const request = require('supertest');
const { criarApp } = require('../src/app');

let app, adminToken, caixaToken;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  app = criarApp(':memory:');
  const r = await request(app).post('/api/auth/login').send({ email: 'admin@cantina.com', senha: 'admin123' });
  adminToken = r.body.token;
  await request(app).post('/api/usuarios').set(auth(adminToken))
    .send({ nome: 'Caixa 1', email: 'caixa@cantina.com', senha: '123456', perfil: 'caixa' });
  const c = await request(app).post('/api/auth/login').send({ email: 'caixa@cantina.com', senha: '123456' });
  caixaToken = c.body.token;
});

describe('Autenticação e autorização', () => {
  test('login com senha errada retorna 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'admin@cantina.com', senha: 'x' });
    expect(r.status).toBe(401);
  });
  test('rota protegida sem token retorna 401', async () => {
    expect((await request(app).get('/api/produtos')).status).toBe(401);
  });
  test('caixa não pode cadastrar produto (403)', async () => {
    const r = await request(app).post('/api/produtos').set(auth(caixaToken)).send({ nome: 'X', preco: 1 });
    expect(r.status).toBe(403);
  });
});

describe('T1 - Cadastro de usuário', () => {
  test('rejeita e-mail duplicado (409)', async () => {
    const r = await request(app).post('/api/usuarios').set(auth(adminToken))
      .send({ nome: 'Outro', email: 'caixa@cantina.com', senha: '123456', perfil: 'caixa' });
    expect(r.status).toBe(409);
  });
  test('rejeita senha curta (400)', async () => {
    const r = await request(app).post('/api/usuarios').set(auth(adminToken))
      .send({ nome: 'N', email: 'n@n.com', senha: '123', perfil: 'caixa' });
    expect(r.status).toBe(400);
  });
});

describe('T2 e T3 - Produto e estoque', () => {
  test('cadastra produto com estoque inicial', async () => {
    const r = await request(app).post('/api/produtos').set(auth(adminToken))
      .send({ nome: 'Coxinha', preco: 6.5, estoque: 10 });
    expect(r.status).toBe(201);
    expect(r.body.estoque).toBe(10);
  });
  test('rejeita preço negativo', async () => {
    const r = await request(app).post('/api/produtos').set(auth(adminToken)).send({ nome: 'Ruim', preco: -1 });
    expect(r.status).toBe(400);
  });
  test('entrada de estoque soma quantidade', async () => {
    const p = await request(app).post('/api/produtos').set(auth(adminToken)).send({ nome: 'Suco', preco: 5, estoque: 2 });
    const r = await request(app).post(`/api/produtos/${p.body.id}/estoque`).set(auth(adminToken)).send({ quantidade: 8 });
    expect(r.body.estoque).toBe(10);
  });
  test('entrada com quantidade inválida retorna 400', async () => {
    const r = await request(app).post('/api/produtos/1/estoque').set(auth(adminToken)).send({ quantidade: 0 });
    expect(r.status).toBe(400);
  });
});

describe('T6 - Cliente', () => {
  test('cadastra cliente', async () => {
    const r = await request(app).post('/api/clientes').set(auth(caixaToken)).send({ nome: 'Maria' });
    expect(r.status).toBe(201);
  });
  test('nome obrigatório', async () => {
    expect((await request(app).post('/api/clientes').set(auth(caixaToken)).send({})).status).toBe(400);
  });
});

describe('T4 e T5 - Venda e cancelamento', () => {
  let produtoId;
  beforeAll(async () => {
    const p = await request(app).post('/api/produtos').set(auth(adminToken)).send({ nome: 'Pastel', preco: 8, estoque: 5 });
    produtoId = p.body.id;
  });
  test('venda calcula total e baixa estoque', async () => {
    const r = await request(app).post('/api/vendas').set(auth(caixaToken))
      .send({ forma_pagamento: 'pix', itens: [{ produto_id: produtoId, quantidade: 2 }] });
    expect(r.status).toBe(201);
    expect(r.body.total).toBe(16);
    const lista = await request(app).get('/api/produtos').set(auth(caixaToken));
    expect(lista.body.find((p) => p.id === produtoId).estoque).toBe(3);
  });
  test('venda com estoque insuficiente retorna 409 e não altera estoque', async () => {
    const r = await request(app).post('/api/vendas').set(auth(caixaToken))
      .send({ forma_pagamento: 'dinheiro', itens: [{ produto_id: produtoId, quantidade: 99 }] });
    expect(r.status).toBe(409);
    const lista = await request(app).get('/api/produtos').set(auth(caixaToken));
    expect(lista.body.find((p) => p.id === produtoId).estoque).toBe(3);
  });
  test('venda sem itens retorna 400', async () => {
    const r = await request(app).post('/api/vendas').set(auth(caixaToken)).send({ forma_pagamento: 'pix', itens: [] });
    expect(r.status).toBe(400);
  });
  test('cancelamento devolve estoque; segundo cancelamento retorna 409', async () => {
    const v = await request(app).post('/api/vendas').set(auth(caixaToken))
      .send({ forma_pagamento: 'cartao', itens: [{ produto_id: produtoId, quantidade: 3 }] });
    const c = await request(app).post(`/api/vendas/${v.body.id}/cancelar`).set(auth(adminToken));
    expect(c.status).toBe(200);
    const lista = await request(app).get('/api/produtos').set(auth(caixaToken));
    expect(lista.body.find((p) => p.id === produtoId).estoque).toBe(3);
    expect((await request(app).post(`/api/vendas/${v.body.id}/cancelar`).set(auth(adminToken))).status).toBe(409);
  });
  test('caixa não pode cancelar venda (403)', async () => {
    expect((await request(app).post('/api/vendas/1/cancelar').set(auth(caixaToken))).status).toBe(403);
  });
});

describe('Relatórios', () => {
  test('mais vendidos e vendas por dia retornam dados', async () => {
    const mv = await request(app).get('/api/relatorios/mais-vendidos?n=3').set(auth(adminToken));
    expect(mv.status).toBe(200);
    expect(mv.body.length).toBeGreaterThan(0);
    const vd = await request(app).get('/api/relatorios/vendas-por-dia').set(auth(adminToken));
    expect(vd.body[0]).toHaveProperty('total');
  });
  test('caixa não acessa relatórios (403)', async () => {
    expect((await request(app).get('/api/relatorios/mais-vendidos').set(auth(caixaToken))).status).toBe(403);
  });
});
