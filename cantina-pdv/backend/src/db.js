const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

function criarBanco(caminho = process.env.DB_PATH || 'cantina.db') {
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON');
  // SQLite embutido do Node (sem compilação nativa): helper de transação
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN');
    try {
      const r = fn(...args);
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK (perfil IN ('admin','caixa'))
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      email TEXT
    );
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      preco REAL NOT NULL CHECK (preco >= 0),
      unidade TEXT NOT NULL DEFAULT 'un',
      estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0)
    );
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      cliente_id INTEGER REFERENCES clientes(id),
      forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('dinheiro','pix','cartao')),
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','cancelada'))
    );
    CREATE TABLE IF NOT EXISTS itens_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL REFERENCES vendas(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      preco_unitario REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS movimentos_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','venda','cancelamento')),
      data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      usuario_id INTEGER REFERENCES usuarios(id)
    );
  `);
  const existe = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (!existe) {
    db.prepare('INSERT INTO usuarios (nome,email,senha_hash,perfil) VALUES (?,?,?,?)')
      .run('Administrador', 'admin@cantina.com', bcrypt.hashSync('admin123', 10), 'admin');
  }
  return db;
}

module.exports = { criarBanco };
