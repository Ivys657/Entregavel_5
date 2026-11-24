import { useState, useEffect, useCallback } from 'react';
import { api, setToken, reais } from './api.js';

function Aviso({ msg }) {
  if (!msg) return null;
  return <div className={'msg ' + (msg.tipo === 'ok' ? 'ok' : 'err')}>{msg.texto}</div>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(null);
  async function entrar(e) {
    e.preventDefault();
    try {
      const r = await api('/auth/login', 'POST', { email, senha });
      setToken(r.token);
      localStorage.setItem('usuario', JSON.stringify(r.usuario));
      onLogin(r.usuario);
    } catch (err) { setMsg({ tipo: 'err', texto: err.message }); }
  }
  return (
    <form className="card login" onSubmit={entrar}>
      <h2>PDV Cantina</h2>
      <Aviso msg={msg} />
      <input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} /><br />
      <input placeholder="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /><br />
      <button className="p">Entrar</button>
    </form>
  );
}

function Vendas({ usuario }) {
  const [produtos, setProdutos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [pagamento, setPagamento] = useState('dinheiro');
  const [clienteId, setClienteId] = useState('');
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    setProdutos(await api('/produtos'));
    setClientes(await api('/clientes'));
    setVendas(await api('/vendas'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = (p) => setCarrinho((c) => {
    const ex = c.find((i) => i.produto_id === p.id);
    return ex ? c.map((i) => (i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i))
              : [...c, { produto_id: p.id, nome: p.nome, preco: p.preco, quantidade: 1 }];
  });
  const total = carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);

  async function finalizar() {
    try {
      await api('/vendas', 'POST', {
        forma_pagamento: pagamento,
        cliente_id: clienteId ? Number(clienteId) : null,
        itens: carrinho.map(({ produto_id, quantidade }) => ({ produto_id, quantidade })),
      });
      setCarrinho([]);
      setMsg({ tipo: 'ok', texto: 'Venda registrada!' });
      carregar();
    } catch (e) { setMsg({ tipo: 'err', texto: e.message }); }
  }
  async function cancelar(id) {
    try { await api(`/vendas/${id}/cancelar`, 'POST'); setMsg({ tipo: 'ok', texto: 'Venda cancelada' }); carregar(); }
    catch (e) { setMsg({ tipo: 'err', texto: e.message }); }
  }

  return (
    <>
      <Aviso msg={msg} />
      <div className="card">
        <h3>Nova venda</h3>
        {produtos.map((p) => (
          <button key={p.id} className="p" style={{ margin: 4 }} disabled={p.estoque < 1} onClick={() => adicionar(p)}>
            {p.nome} · {reais(p.preco)} ({p.estoque})
          </button>
        ))}
        <table>
          <thead><tr><th>Item</th><th>Qtd</th><th>Subtotal</th></tr></thead>
          <tbody>{carrinho.map((i) => (
            <tr key={i.produto_id}><td>{i.nome}</td><td>{i.quantidade}</td><td>{reais(i.preco * i.quantidade)}</td></tr>
          ))}</tbody>
        </table>
        <p><b>Total: {reais(total)}</b></p>
        <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
          <option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="cartao">Cartão</option>
        </select>
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Sem cliente</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button className="p" disabled={!carrinho.length} onClick={finalizar}>Finalizar venda</button>
      </div>
      <div className="card">
        <h3>Vendas</h3>
        <table>
          <thead><tr><th>#</th><th>Data</th><th>Cliente</th><th>Pgto</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>{vendas.map((v) => (
            <tr key={v.id}>
              <td>{v.id}</td><td>{v.data}</td><td>{v.cliente || '-'}</td><td>{v.forma_pagamento}</td>
              <td>{reais(v.total)}</td><td>{v.status}</td>
              <td>{usuario.perfil === 'admin' && v.status === 'concluida' &&
                <button className="p perigo" onClick={() => cancelar(v.id)}>Cancelar</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Produtos() {
  const [lista, setLista] = useState([]);
  const [f, setF] = useState({ nome: '', preco: '', unidade: 'un', estoque: '0' });
  const [repor, setRepor] = useState({});
  const [msg, setMsg] = useState(null);
  const carregar = useCallback(async () => setLista(await api('/produtos')), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    try {
      await api('/produtos', 'POST', { nome: f.nome, preco: Number(f.preco), unidade: f.unidade, estoque: Number(f.estoque) });
      setF({ nome: '', preco: '', unidade: 'un', estoque: '0' });
      setMsg({ tipo: 'ok', texto: 'Produto cadastrado' }); carregar();
    } catch (e2) { setMsg({ tipo: 'err', texto: e2.message }); }
  }
  async function reposicao(id) {
    try {
      await api(`/produtos/${id}/estoque`, 'POST', { quantidade: Number(repor[id]) });
      setRepor({ ...repor, [id]: '' }); setMsg({ tipo: 'ok', texto: 'Estoque atualizado' }); carregar();
    } catch (e2) { setMsg({ tipo: 'err', texto: e2.message }); }
  }
  return (
    <>
      <Aviso msg={msg} />
      <form className="card" onSubmit={salvar}>
        <h3>Novo produto</h3>
        <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input placeholder="Preço" type="number" step="0.01" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
        <input placeholder="Unidade" value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })} />
        <input placeholder="Estoque inicial" type="number" value={f.estoque} onChange={(e) => setF({ ...f, estoque: e.target.value })} />
        <button className="p">Cadastrar</button>
      </form>
      <div className="card">
        <h3>Estoque</h3>
        <table>
          <thead><tr><th>Produto</th><th>Preço</th><th>Un.</th><th>Estoque</th><th>Repor</th></tr></thead>
          <tbody>{lista.map((p) => (
            <tr key={p.id}>
              <td>{p.nome}</td><td>{reais(p.preco)}</td><td>{p.unidade}</td><td>{p.estoque}</td>
              <td>
                <input style={{ width: 70 }} type="number" value={repor[p.id] || ''} onChange={(e) => setRepor({ ...repor, [p.id]: e.target.value })} />
                <button className="p" onClick={() => reposicao(p.id)}>+</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Clientes() {
  const [lista, setLista] = useState([]);
  const [f, setF] = useState({ nome: '', telefone: '', email: '' });
  const [msg, setMsg] = useState(null);
  const carregar = useCallback(async () => setLista(await api('/clientes')), []);
  useEffect(() => { carregar(); }, [carregar]);
  async function salvar(e) {
    e.preventDefault();
    try { await api('/clientes', 'POST', f); setF({ nome: '', telefone: '', email: '' }); setMsg({ tipo: 'ok', texto: 'Cliente cadastrado' }); carregar(); }
    catch (e2) { setMsg({ tipo: 'err', texto: e2.message }); }
  }
  return (
    <>
      <Aviso msg={msg} />
      <form className="card" onSubmit={salvar}>
        <h3>Novo cliente</h3>
        <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input placeholder="Telefone" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
        <input placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <button className="p">Cadastrar</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th></tr></thead>
          <tbody>{lista.map((c) => <tr key={c.id}><td>{c.nome}</td><td>{c.telefone}</td><td>{c.email}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function Usuarios() {
  const [lista, setLista] = useState([]);
  const [f, setF] = useState({ nome: '', email: '', senha: '', perfil: 'caixa' });
  const [msg, setMsg] = useState(null);
  const carregar = useCallback(async () => setLista(await api('/usuarios')), []);
  useEffect(() => { carregar(); }, [carregar]);
  async function salvar(e) {
    e.preventDefault();
    try { await api('/usuarios', 'POST', f); setF({ nome: '', email: '', senha: '', perfil: 'caixa' }); setMsg({ tipo: 'ok', texto: 'Usuário cadastrado' }); carregar(); }
    catch (e2) { setMsg({ tipo: 'err', texto: e2.message }); }
  }
  return (
    <>
      <Aviso msg={msg} />
      <form className="card" onSubmit={salvar}>
        <h3>Novo usuário</h3>
        <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input placeholder="Senha" type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        <select value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value })}>
          <option value="caixa">Caixa</option><option value="admin">Admin</option>
        </select>
        <button className="p">Cadastrar</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr></thead>
          <tbody>{lista.map((u) => <tr key={u.id}><td>{u.nome}</td><td>{u.email}</td><td>{u.perfil}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function Relatorios() {
  const [porDia, setPorDia] = useState([]);
  const [top, setTop] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [hist, setHist] = useState([]);
  useEffect(() => {
    api('/relatorios/vendas-por-dia').then(setPorDia);
    api('/relatorios/mais-vendidos?n=5').then(setTop);
    api('/clientes').then(setClientes);
  }, []);
  useEffect(() => { clienteId ? api(`/relatorios/historico-cliente/${clienteId}`).then(setHist) : setHist([]); }, [clienteId]);
  return (
    <>
      <div className="card"><h3>Vendas por dia</h3>
        <table><thead><tr><th>Dia</th><th>Vendas</th><th>Total</th></tr></thead>
          <tbody>{porDia.map((d) => <tr key={d.dia}><td>{d.dia}</td><td>{d.vendas}</td><td>{reais(d.total)}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Produtos mais vendidos</h3>
        <table><thead><tr><th>Produto</th><th>Qtd</th><th>Receita</th></tr></thead>
          <tbody>{top.map((p) => <tr key={p.nome}><td>{p.nome}</td><td>{p.quantidade}</td><td>{reais(p.receita)}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Histórico de compras do cliente</h3>
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Selecione...</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <table><thead><tr><th>#</th><th>Data</th><th>Pgto</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>{hist.map((v) => <tr key={v.id}><td>{v.id}</td><td>{v.data}</td><td>{v.forma_pagamento}</td><td>{reais(v.total)}</td><td>{v.status}</td></tr>)}</tbody></table></div>
    </>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(() => JSON.parse(localStorage.getItem('usuario') || 'null'));
  const [aba, setAba] = useState('vendas');
  if (!usuario) return <Login onLogin={setUsuario} />;

  const admin = usuario.perfil === 'admin';
  const abas = [['vendas', 'Vendas'], ['clientes', 'Clientes'],
    ...(admin ? [['produtos', 'Produtos/Estoque'], ['usuarios', 'Usuários'], ['relatorios', 'Relatórios']] : [])];
  const sair = () => { setToken(null); localStorage.removeItem('usuario'); setUsuario(null); };

  return (
    <>
      <header><b>PDV Cantina</b><span>{usuario.nome} ({usuario.perfil}) <button className="p" onClick={sair}>Sair</button></span></header>
      <nav>{abas.map(([k, n]) => <button key={k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>{n}</button>)}</nav>
      <main>
        {aba === 'vendas' && <Vendas usuario={usuario} />}
        {aba === 'clientes' && <Clientes />}
        {admin && aba === 'produtos' && <Produtos />}
        {admin && aba === 'usuarios' && <Usuarios />}
        {admin && aba === 'relatorios' && <Relatorios />}
      </main>
    </>
  );
}
