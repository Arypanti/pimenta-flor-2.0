const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Cria o arquivo do banco de dados na raiz do projeto
const dbPath = path.join(__dirname, '..', '..', 'pimenta_flor.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Erro ao abrir o banco de dados:", err.message);
    } else {
        console.log("Banco de dados SQLite conectado com sucesso!");
    }
});

db.serialize(() => {

    // =========================================================
    // 1. TABELA DE CLIENTES
    // =========================================================
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        endereco TEXT,
        pontos_fidelidade INTEGER DEFAULT 0
    )`);


    // =========================================================
    // 2. TABELA DE PRODUTOS
    // =========================================================
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        referencia TEXT,
        categoria TEXT,
        preco REAL NOT NULL,
        quantidade_estoque INTEGER NOT NULL
    )`);


    // =========================================================
    // 2.1 ATUALIZAÇÃO DA TABELA DE PRODUTOS
    // Adiciona referência caso o banco já exista.
    // Não apaga os produtos cadastrados.
    // =========================================================
    db.run(`
        ALTER TABLE produtos
        ADD COLUMN referencia TEXT
    `, (err) => {

        if (err && !err.message.includes('duplicate column name')) {
            console.error(
                'Erro ao adicionar referência aos produtos:',
                err.message
            );
        }

    });


    // =========================================================
    // 3. TABELA DE VENDAS
    // =========================================================
    db.run(`CREATE TABLE IF NOT EXISTS vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        data_venda TEXT DEFAULT CURRENT_TIMESTAMP,
        total REAL NOT NULL,
        tipo_pagamento TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )`);


    // =========================================================
    // 3.1 TABELA DE ITENS DA VENDA
    // =========================================================
    db.run(`CREATE TABLE IF NOT EXISTS itens_venda (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER,
        produto_id INTEGER,
        quantidade INTEGER,
        preco_unitario REAL,
        FOREIGN KEY (venda_id) REFERENCES vendas(id),
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
    )`);


    // =========================================================
    // 4. TABELA DE PENDÊNCIAS
    // =========================================================
    db.run(`CREATE TABLE IF NOT EXISTS pendencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL,
        venda_id INTEGER NOT NULL,

        valor_original REAL NOT NULL,
        valor_restante REAL NOT NULL,

        status TEXT DEFAULT 'Aberto',

        numero_parcelas INTEGER DEFAULT 1,
        valor_parcela REAL DEFAULT 0,

        data_vencimento TEXT,

        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (venda_id) REFERENCES vendas(id)
    )`);

        // =========================================================
    // 5. TABELA DE PARCELAS DAS PENDÊNCIAS
    // =========================================================
    // Guarda cada parcela individualmente:
    // valor, valor pago, saldo, vencimento e situação.
    // =========================================================
    db.run(`CREATE TABLE IF NOT EXISTS parcelas_pendencia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        pendencia_id INTEGER NOT NULL,

        numero_parcela INTEGER NOT NULL,

        valor REAL NOT NULL,
        valor_pago REAL DEFAULT 0,
        valor_restante REAL NOT NULL,

        data_vencimento TEXT,

        status TEXT DEFAULT 'Aberta',

        FOREIGN KEY (pendencia_id) REFERENCES pendencias(id)
    )`);

});

module.exports = db;