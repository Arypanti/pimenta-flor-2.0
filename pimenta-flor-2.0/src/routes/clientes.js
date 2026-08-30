const express = require('express');
const router = express.Router();
const db = require('../database/database');

// 1. ROTA DE LISTAR: Busca todas as clientes do banco para mostrar na tabela
router.get('/dados', (req, res) => {
    const query = `SELECT * FROM clientes ORDER BY nome ASC`;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("Erro ao buscar clientes:", err.message);
            return res.status(500).json({ erro: "Erro ao buscar clientes" });
        }
        res.json(rows); // Devolve a lista de clientes em formato de texto/dados
    });
});

// 2. ROTA DE BUSCAR UMA CLIENTE: usada pelo botão Editar para garantir dados atuais.
router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: 'ID inválido.' });

    db.get(`SELECT id, nome, telefone, endereco FROM clientes WHERE id = ?`, [id], (err, cliente) => {
        if (err) {
            console.error("Erro ao buscar cliente:", err.message);
            return res.status(500).json({ erro: "Erro ao buscar cliente." });
        }
        if (!cliente) return res.status(404).json({ erro: "Cliente não encontrada." });
        res.json(cliente);
    });
});

// 2. ROTA DE SALVAR: Recebe os dados do formulário e grava no banco
router.post('/', (req, res) => {
    const { nome, telefone, endereco } = req.body;
    const query = `INSERT INTO clientes (nome, telefone, endereco) VALUES (?, ?, ?)`;
    
    db.run(query, [nome, telefone, endereco], function(err) {
        if (err) {
            console.error("Erro ao cadastrar cliente:", err.message);
            return res.status(500).send("Erro ao salvar cliente.");
        }
        console.log(`Cliente cadastrada com sucesso! ID: ${this.lastID}`);
        res.redirect('/clientes'); // Recarrega a página para atualizar a lista
    });
});

// 3. ROTA DE ATUALIZAR (NOVA): Recebe os dados alterados da mesma tela e atualiza no SQLite
router.post('/editar/:id', (req, res) => {
    const idCliente = req.params.id;
    const { nome, telefone, endereco } = req.body;
    
    const query = `UPDATE clientes SET nome = ?, telefone = ?, endereco = ? WHERE id = ?`;
    
    db.run(query, [nome, telefone, endereco, idCliente], function(err) {
        if (err) {
            console.error(`Erro ao atualizar cliente ID ${idCliente}:`, err.message);
            return res.status(500).send("Erro ao salvar as alterações do cliente.");
        }
        
        console.log(`Dados da cliente ID ${idCliente} atualizados com sucesso!`);
        res.redirect('/clientes'); // Recarrega a página trazendo a tabela atualizada
    });
});

module.exports = router;