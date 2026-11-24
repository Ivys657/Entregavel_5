let token = localStorage.getItem('token');
export const setToken = (t) => { token = t; t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); };

export async function api(caminho, metodo = 'GET', corpo) {
  const r = await fetch('/api' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Erro na requisição');
  return dados;
}
export const reais = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
