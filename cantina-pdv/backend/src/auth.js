const jwt = require('jsonwebtoken');
const SEGREDO = process.env.JWT_SECRET || 'segredo-de-desenvolvimento';

const gerarToken = (u) =>
  jwt.sign({ id: u.id, nome: u.nome, perfil: u.perfil }, SEGREDO, { expiresIn: '8h' });

// Autenticação: exige token válido
function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Token não informado' });
  try {
    req.usuario = jwt.verify(token, SEGREDO);
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

// Autorização: exige um dos perfis informados
const autorizar = (...perfis) => (req, res, next) =>
  perfis.includes(req.usuario.perfil)
    ? next()
    : res.status(403).json({ erro: 'Acesso negado para este perfil' });

module.exports = { gerarToken, autenticar, autorizar };
