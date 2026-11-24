const { criarApp } = require('./app');
const porta = process.env.PORT || 3001;
criarApp().listen(porta, () => console.log(`API rodando em http://localhost:${porta}`));
