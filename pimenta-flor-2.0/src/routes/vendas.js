const express = require('express');
const router = express.Router();
const db = require('../database/database');

function dataHoraSaoPaulo() {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).format(new Date()).replace('T', ' ');
}

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// =========================================================================
// RESUMO DO PAINEL
// =========================================================================
router.get('/resumo-painel', (req, res) => {
    const queryVendasHoje = `
        SELECT SUM(total) as vendas_dia
        FROM vendas
        WHERE DATE(data_venda) = DATE('now', 'localtime')
    `;

    const queryEstoqueBaixo = `
        SELECT COUNT(*) as baixo_estoque
        FROM produtos
        WHERE quantidade_estoque <= 3
    `;

    const queryTotalPendencias = `
        SELECT SUM(valor_restante) as total_pendente
        FROM pendencias
        WHERE status != 'Quitado' AND valor_restante > 0
    `;

    db.get(queryVendasHoje, [], (err, rowVendas) => {
        if (err) return res.status(500).json({ erro: 'Erro no painel.' });
        db.get(queryEstoqueBaixo, [], (err, rowEstoque) => {
            if (err) return res.status(500).json({ erro: 'Erro no painel.' });
            db.get(queryTotalPendencias, [], (err, rowPendencias) => {
                if (err) return res.status(500).json({ erro: 'Erro no painel.' });
                res.json({
                    vendas_dia: rowVendas?.vendas_dia || 0,
                    baixo_estoque: rowEstoque?.baixo_estoque || 0,
                    total_pende_painel: rowPendencias?.total_pendente || 0
                });
            });
        });
    });
});

// =========================================================================
// HISTÓRICO DE VENDAS
// =========================================================================
router.get('/dados', (req, res) => {
    const { inicio, fim } = req.query;
    const query = `
        SELECT v.*, c.nome as cliente_nome
        FROM vendas v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        WHERE DATE(v.data_venda) BETWEEN DATE(?) AND DATE(?)
        ORDER BY v.id DESC
    `;
    db.all(query, [inicio, fim], (err, rows) => {
        if (err) {
            console.error('Erro ao filtrar histórico de vendas:', err.message);
            return res.status(500).json({ erro: 'Erro ao buscar vendas.' });
        }
        res.json(rows);
    });
});

// =========================================================================
// REGISTRAR VENDA — MULTI-ITENS + FIADO EM ATÉ 5 PARCELAS
// =========================================================================
router.post('/', async (req, res) => {

    const {
        cliente_id,
        tipo_pagamento,
        itens,
        numero_parcelas
    } = req.body;

    const pagamento = String(tipo_pagamento || '').trim();

    const tiposPermitidos = ['Pix', 'Cartão', 'Pendência'];

    // ---------------------------------------------------------
    // VALIDAÇÃO DO NÚMERO DE PARCELAS
    // ---------------------------------------------------------

    let numeroParcelas = Number(numero_parcelas || 1);

    if (
        !Number.isInteger(numeroParcelas) ||
        numeroParcelas < 1 ||
        numeroParcelas > 5
    ) {
        return res.status(400).json({
            erro: 'O número de parcelas deve estar entre 1 e 5.'
        });
    }

    // Pix e Cartão não utilizam parcelamento de fiado.
    if (pagamento !== 'Pendência') {
        numeroParcelas = 1;
    }

    if (!tiposPermitidos.includes(pagamento)) {
        return res.status(400).json({
            erro: 'Forma de pagamento inválida.'
        });
    }

    // ---------------------------------------------------------
    // VALIDAÇÃO DO CARRINHO
    // ---------------------------------------------------------

    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({
            erro: 'O carrinho está vazio.'
        });
    }

    // ---------------------------------------------------------
    // NORMALIZA OS ITENS
    // ---------------------------------------------------------

    const itensNormalizados = new Map();

    for (const item of itens) {

        const id = Number(item.id);
        const quantidade = Number(item.quantidade);

        if (
            !Number.isInteger(id) ||
            id <= 0 ||
            !Number.isInteger(quantidade) ||
            quantidade <= 0
        ) {
            return res.status(400).json({
                erro: 'Existe um item com produto ou quantidade inválida.'
            });
        }

        itensNormalizados.set(
            id,
            (itensNormalizados.get(id) || 0) + quantidade
        );
    }

    const ids = [...itensNormalizados.keys()];
    const placeholders = ids.map(() => '?').join(',');

    let transacaoAberta = false;

    try {

        // -----------------------------------------------------
        // CLIENTE
        // -----------------------------------------------------

        const clienteId =
            cliente_id === '' ||
            cliente_id === null ||
            cliente_id === undefined
                ? null
                : Number(cliente_id);

        if (
            clienteId !== null &&
            (!Number.isInteger(clienteId) || clienteId <= 0)
        ) {
            return res.status(400).json({
                erro: 'Cliente inválido.'
            });
        }

        // Fiado precisa obrigatoriamente de cliente cadastrado.
        if (pagamento === 'Pendência' && clienteId === null) {
            return res.status(400).json({
                erro: 'Para registrar uma pendência, selecione uma cliente cadastrada.'
            });
        }

        if (clienteId !== null) {

            const cliente = await get(
                'SELECT id FROM clientes WHERE id = ?',
                [clienteId]
            );

            if (!cliente) {
                return res.status(400).json({
                    erro: 'Cliente não encontrado.'
                });
            }
        }

        // -----------------------------------------------------
        // BUSCAR PRODUTOS
        // -----------------------------------------------------

        const produtos = await all(
            `SELECT id, nome, preco, quantidade_estoque
             FROM produtos
             WHERE id IN (${placeholders})`,
            ids
        );

        if (produtos.length !== ids.length) {
            return res.status(400).json({
                erro: 'Um ou mais produtos não foram encontrados.'
            });
        }

        const produtosPorId = new Map(
            produtos.map(p => [p.id, p])
        );

        const itensFinais = [];

        let totalGeral = 0;

        // -----------------------------------------------------
        // VALIDAR ESTOQUE E CALCULAR TOTAL
        // -----------------------------------------------------

        for (const id of ids) {

            const produto = produtosPorId.get(id);
            const quantidade = itensNormalizados.get(id);

            if (quantidade > produto.quantidade_estoque) {
                return res.status(400).json({
                    erro:
                        `Estoque insuficiente para "${produto.nome}". ` +
                        `Disponível: ${produto.quantidade_estoque}.`
                });
            }

            const subtotal =
                Number(produto.preco) * quantidade;

            totalGeral += subtotal;

            itensFinais.push({
                id: produto.id,
                nome: produto.nome,
                quantidade,
                preco: Number(produto.preco),
                subtotal
            });
        }

        totalGeral = Number(totalGeral.toFixed(2));

        // -----------------------------------------------------
        // CALCULAR PARCELA
        // -----------------------------------------------------

        let valorParcela = 0;

        if (pagamento === 'Pendência') {
            valorParcela = Number(
                (totalGeral / numeroParcelas).toFixed(2)
            );
        }

        // -----------------------------------------------------
        // INICIAR TRANSAÇÃO
        // -----------------------------------------------------

        await run('BEGIN TRANSACTION');

        transacaoAberta = true;

        // -----------------------------------------------------
        // REGISTRAR VENDA
        // -----------------------------------------------------

        const venda = await run(
            `INSERT INTO vendas
             (cliente_id, total, tipo_pagamento, data_venda)
             VALUES (?, ?, ?, ?)`,
            [
                clienteId,
                totalGeral,
                pagamento,
                new Date().toLocaleString('sv-SE', {
                    timeZone: 'America/Sao_Paulo'
                })
            ]
        );

        const vendaId = venda.lastID;

        // -----------------------------------------------------
        // REGISTRAR CADA ITEM DA VENDA
        // -----------------------------------------------------

        for (const item of itensFinais) {

            await run(
                `INSERT INTO itens_venda
                 (venda_id, produto_id, quantidade, preco_unitario)
                 VALUES (?, ?, ?, ?)`,
                [
                    vendaId,
                    item.id,
                    item.quantidade,
                    item.preco
                ]
            );

            // Baixar estoque

            const baixa = await run(
                `UPDATE produtos
                 SET quantidade_estoque =
                     quantidade_estoque - ?
                 WHERE id = ?
                 AND quantidade_estoque >= ?`,
                [
                    item.quantidade,
                    item.id,
                    item.quantidade
                ]
            );

            if (baixa.changes !== 1) {
                throw new Error(
                    `Estoque alterado durante a venda para o produto ${item.id}.`
                );
            }
        }

  // -----------------------------------------------------
 // REGISTRAR PENDÊNCIA / FIADO
 // -----------------------------------------------------

if (pagamento === 'Pendência') {

    // -----------------------------------------------------
    // CRIAR A PENDÊNCIA PRINCIPAL
    // -----------------------------------------------------

    const pendencia = await run(
        `INSERT INTO pendencias
         (
            cliente_id,
            venda_id,
            valor_original,
            valor_restante,
            status,
            numero_parcelas,
            valor_parcela
         )
         VALUES (?, ?, ?, ?, 'Aberto', ?, ?)`,
        [
            clienteId,
            vendaId,
            totalGeral,
            totalGeral,
            numeroParcelas,
            valorParcela
        ]
    );

    const pendenciaId = pendencia.lastID;

    // -----------------------------------------------------
    // CRIAR CADA PARCELA
    // -----------------------------------------------------

    let valorAcumulado = 0;

    for (let i = 1; i <= numeroParcelas; i++) {

        let valorAtual;

        if (i === numeroParcelas) {
            // A última parcela recebe eventual diferença de centavos.
            valorAtual = Number(
                (totalGeral - valorAcumulado).toFixed(2)
            );
        } else {
            valorAtual = valorParcela;
        }

        valorAcumulado = Number(
            (valorAcumulado + valorAtual).toFixed(2)
        );

        // -------------------------------------------------
        // DATA DE VENCIMENTO
        // Cada parcela vence no mesmo dia dos meses seguintes.
        // -------------------------------------------------

        const dataBase = new Date();

        dataBase.setHours(0, 0, 0, 0);

        dataBase.setMonth(
            dataBase.getMonth() + i
        );

        const ano = dataBase.getFullYear();
        const mes = String(dataBase.getMonth() + 1).padStart(2, '0');
        const dia = String(dataBase.getDate()).padStart(2, '0');

        const dataVencimento =
            `${ano}-${mes}-${dia}`;

        await run(
            `INSERT INTO parcelas_pendencia
             (
                pendencia_id,
                numero_parcela,
                valor,
                valor_pago,
                valor_restante,
                data_vencimento,
                status
             )
             VALUES (?, ?, ?, ?, ?, ?, 'Aberta')`,
            [
                pendenciaId,
                i,
                valorAtual,
                0,
                valorAtual,
                dataVencimento
            ]
        );
    }
}

// -----------------------------------------------------
// FINALIZAR TRANSAÇÃO
// -----------------------------------------------------

await run('COMMIT');

transacaoAberta = false;

console.log(
    `Venda #${vendaId} registrada com ` +
    `${itensFinais.length} produto(s), ` +
    `total R$ ${totalGeral.toFixed(2)}.`
);

return res.status(201).json({
    sucesso: true,
    venda_id: vendaId,
    total: totalGeral,
    numero_parcelas: numeroParcelas,
    valor_parcela: valorParcela,
    itens: itensFinais
});

} catch (err) {

    console.error(
        'Erro ao registrar venda:',
        err.message
    );

    if (transacaoAberta) {

        try {
            await run('ROLLBACK');
        } catch (rollbackErr) {

            console.error(
                'Erro ao desfazer transação:',
                rollbackErr.message
            );
        }
    }

    return res.status(500).json({
        erro:
            'Não foi possível concluir a venda. ' +
            'Nenhuma alteração parcial foi mantida.'
    });
}

});

    
// =========================================================================
// ITENS DE UMA VENDA ESPECÍFICA
// =========================================================================
router.get('/:id/itens', (req, res) => {
    const vendaId = req.params.id;
    const query = `
        SELECT iv.*, p.nome as produto_nome
        FROM itens_venda iv
        JOIN produtos p ON iv.produto_id = p.id
        WHERE iv.venda_id = ?
        ORDER BY iv.id ASC
    `;
    db.all(query, [vendaId], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar itens da venda:', err.message);
            return res.status(500).json({ erro: 'Erro ao buscar itens.' });
        }
        res.json(rows);
    });
});

module.exports = router;
