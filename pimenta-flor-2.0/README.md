# 🌸 Sistema Pimenta Flor

Sistema de gestão desenvolvido para auxiliar nas rotinas administrativas de uma pequena loja.

O projeto permite gerenciar produtos, clientes, vendas, pendências financeiras e visualizar relatórios para acompanhamento das operações.

## ✨ Funcionalidades

- 📦 Cadastro e gerenciamento de produtos
- 📊 Controle de estoque
- 👥 Cadastro e gerenciamento de clientes
- 🛒 Registro de vendas
- 📜 Histórico de vendas
- 💰 Controle de pendências financeiras
- 📈 Relatório de estoque
- 📊 Relatório de vendas
- 📝 Relatório de pendências

## 🛠️ Tecnologias utilizadas

- Node.js
- Express
- SQLite
- JavaScript
- HTML5
- CSS3

## 📂 Estrutura do projeto

```text
pimenta-flor-2.0/
│
├── public/
│   └── style.css
│
├── src/
│   ├── database/
│   │   └── database.js
│   │
│   ├── routes/
│   │   ├── clientes.js
│   │   ├── pendencias.js
│   │   ├── produtos.js
│   │   └── vendas.js
│   │
│   └── views/
│       ├── dashboard.html
│       ├── clientes.html
│       ├── produtos.html
│       ├── vendas.html
│       ├── pendencias.html
│       ├── historico-vendas.html
│       ├── relatorio-estoque.html
│       ├── relatorio-vendas.html
│       └── relatorio-pendencias.html
│
├── server.js
├── package.json
└── README.md