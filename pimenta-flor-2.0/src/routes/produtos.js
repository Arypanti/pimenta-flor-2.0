const express = require('express');
const router = express.Router();
const db = require('../database/database');

// =========================================================
// LISTA TODOS OS PRODUTOS
// =========================================================
router.get('/dados', (req, res) => {

    const query = `
        SELECT
            id,
            nome,
            referencia,
            categoria,
            preco,
            quantidade_estoque
        FROM produtos
        ORDER BY id DESC
    `;

    db.all(query, [], (err, rows) => {

        if (err) {
            console.error(
                "Erro ao buscar produtos no banco:",
                err.message
            );

            return res.status(500).json({
                erro: "Erro ao buscar produtos."
            });
        }

        res.json(rows);
    });
});


// =========================================================
// BUSCA UM ÚNICO PRODUTO PARA EDIÇÃO
// =========================================================
router.get('/:id', (req, res) => {

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            erro: 'ID inválido.'
        });
    }

    db.get(
        `
        SELECT
            id,
            nome,
            referencia,
            categoria,
            preco,
            quantidade_estoque
        FROM produtos
        WHERE id = ?
        `,
        [id],
        (err, produto) => {

            if (err) {
                return res.status(500).json({
                    erro: 'Erro ao buscar produto.'
                });
            }

            if (!produto) {
                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }

            res.json(produto);
        }
    );
});


// =========================================================
// VALIDAÇÃO DO PRODUTO
// =========================================================
function validarProduto(body) {

    const {
        nome,
        referencia = '',
        categoria = '',
        preco,
        quantidade_estoque
    } = body;

    if (
        !nome ||
        !String(nome).trim() ||

        !Number.isFinite(Number(preco)) ||
        Number(preco) < 0 ||

        !Number.isInteger(Number(quantidade_estoque)) ||
        Number(quantidade_estoque) < 0
    ) {
        return null;
    }

    return [
        String(nome).trim(),
        String(referencia).trim(),
        String(categoria).trim(),
        Number(preco),
        Number(quantidade_estoque)
    ];
}


// =========================================================
// CADASTRA PRODUTO NOVO
// =========================================================
router.post('/', (req, res) => {

    const dados = validarProduto(req.body);

    if (!dados) {
        return res.status(400).json({
            erro: 'Dados do produto inválidos.'
        });
    }

    db.run(
        `
        INSERT INTO produtos
        (
            nome,
            referencia,
            categoria,
            preco,
            quantidade_estoque
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        dados,
        function(err) {

            if (err) {

                console.error(
                    "Erro ao cadastrar novo produto:",
                    err.message
                );

                return res.status(500).json({
                    erro: 'Erro ao cadastrar produto.'
                });
            }

            console.log(
                `Produto "${dados[0]}" ` +
                `(Ref. ${dados[1] || 'sem referência'}) ` +
                `cadastrado com sucesso! ID: ${this.lastID}`
            );

            res.status(201).json({
                id: this.lastID
            });
        }
    );
});


// =========================================================
// ATUALIZA PRODUTO EXISTENTE
// =========================================================
router.put('/:id', (req, res) => {

    const id = Number(req.params.id);
    const dados = validarProduto(req.body);

    if (
        !Number.isInteger(id) ||
        !dados
    ) {
        return res.status(400).json({
            erro: 'Dados do produto inválidos.'
        });
    }

    db.run(
        `
        UPDATE produtos
        SET
            nome = ?,
            referencia = ?,
            categoria = ?,
            preco = ?,
            quantidade_estoque = ?
        WHERE id = ?
        `,
        [...dados, id],
        function(err) {

            if (err) {

                console.error(
                    "Erro ao atualizar produto no banco:",
                    err.message
                );

                return res.status(500).json({
                    erro: 'Erro ao atualizar produto.'
                });
            }

            if (!this.changes) {
                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }

            res.json({
                sucesso: true
            });
        }
    );
});


// =========================================================
// COMPATIBILIDADE COM O FLUXO ANTIGO
// =========================================================
router.post('/editar', (req, res) => {

    const { id } = req.body;
    const dados = validarProduto(req.body);

    if (
        !Number.isInteger(Number(id)) ||
        !dados
    ) {
        return res.status(400).send(
            'Dados do produto inválidos.'
        );
    }

    db.run(
        `
        UPDATE produtos
        SET
            nome = ?,
            referencia = ?,
            categoria = ?,
            preco = ?,
            quantidade_estoque = ?
        WHERE id = ?
        `,
        [...dados, Number(id)],
        function(err) {

            if (err) {
                return res.status(500).send(
                    'Erro ao atualizar produto.'
                );
            }

            if (!this.changes) {
                return res.status(404).send(
                    'Produto não encontrado.'
                );
            }

            res.sendStatus(200);
        }
    );
});


module.exports = router;