# PDV Cantina

Sistema de ponto de venda para uma cantina. Trabalho final de **Ambientes de Desenvolvimento de Software** (equipe individual: 6 transações).

## Tecnologias
- **Frontend:** React (Vite), HTML, CSS, JavaScript
- **Backend:** Node.js + Express, Web Service REST
- **Banco:** SQLite (módulo nativo `node:sqlite`, requer Node 22.13 ou superior; sem compilação, sem Python)
- **Segurança:** autenticação JWT, senhas com bcrypt, autorização por perfil (`admin` e `caixa`)
- **Testes:** Jest + Supertest (18 testes nos serviços)
- **Versionamento:** Git/GitHub

## Como executar
```bash
# Backend (porta 3001)
cd backend && npm install && npm start
# Testes
npm test

# Frontend (porta 5173), em outro terminal
cd frontend && npm install && npm run dev
```
Usuário inicial: `admin@cantina.com` / `admin123` (troque após o primeiro acesso).

## Transações (6)
| # | Transação | Perfil | Rota |
|---|-----------|--------|------|
| T1 | Cadastrar usuário | admin | `POST /api/usuarios` |
| T2 | Cadastrar produto | admin | `POST /api/produtos` |
| T3 | Dar entrada de estoque | admin | `POST /api/produtos/:id/estoque` |
| T4 | Registrar venda (baixa estoque) | admin, caixa | `POST /api/vendas` |
| T5 | Cancelar venda (devolve estoque) | admin | `POST /api/vendas/:id/cancelar` |
| T6 | Cadastrar cliente | admin, caixa | `POST /api/clientes` |

## Demais serviços
| Rota | Descrição | Perfil |
|------|-----------|--------|
| `POST /api/auth/login` | Entrada: `{email, senha}` · Saída: `{token, usuario}` | público |
| `GET /api/produtos`, `/clientes`, `/vendas` | Listagens | autenticado |
| `GET /api/usuarios` | Lista usuários | admin |
| `GET /api/relatorios/vendas-por-dia?inicio&fim` | Vendas e total por dia | admin |
| `GET /api/relatorios/mais-vendidos?n=5` | N produtos mais vendidos | admin |
| `GET /api/relatorios/historico-cliente/:id` | Compras de um cliente | admin |

### Entradas e saídas das transações
- **T1** entrada `{nome, email, senha(>=6), perfil}` → `201 {id,nome,email,perfil}`; `409` e-mail duplicado; `400` dados inválidos.
- **T2** entrada `{nome, preco>=0, unidade, estoque}` → `201 {id,...}`; `409` produto duplicado.
- **T3** entrada `{quantidade>0}` → `200 {id, estoque}`; `404` produto inexistente.
- **T4** entrada `{forma_pagamento: dinheiro|pix|cartao, cliente_id?, itens:[{produto_id, quantidade}]}` → `201 {id,total,status,...}`; `409` estoque insuficiente (operação atômica, nada é gravado).
- **T5** sem corpo → `200 {id,status:"cancelada"}`; `409` já cancelada.
- **T6** entrada `{nome, telefone?, email?}` → `201 {id,...}`.

## Modelo do banco
`usuarios(id, nome, email, senha_hash, perfil)` · `clientes(id, nome, telefone, email)` · `produtos(id, nome, preco, unidade, estoque)` · `vendas(id, data, usuario_id→usuarios, cliente_id→clientes, forma_pagamento, total, status)` · `itens_venda(id, venda_id→vendas, produto_id→produtos, quantidade, preco_unitario)` · `movimentos_estoque(id, produto_id→produtos, quantidade, tipo, data, usuario_id→usuarios)`

## Telas
Login · Vendas (carrinho + histórico) · Clientes · Produtos/Estoque (admin) · Usuários (admin) · Relatórios (admin)

## Eventos
Entrar, sair, adicionar item ao carrinho, finalizar venda, cancelar venda, cadastrar produto, repor estoque, cadastrar cliente, cadastrar usuário, consultar relatórios.
