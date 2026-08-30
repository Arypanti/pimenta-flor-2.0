const express = require('express');
const router = express.Router();
const db = require('../database/database');

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


// =========================================================
// LISTA AS PENDÊNCIAS ABERTAS/PARCIAIS
// =========================================================
router.get('/dados', (req, res) => {

    const query = `
        SELECT
            p.id,
            p.cliente_id,
            p.venda_id,

            p.valor_original,
            p.valor_restante,

            p.numero_parcelas,
            p.valor_parcela,

            ROUND(
                p.valor_original - p.valor_restante,
                2
            ) AS valor_pago,

            p.status,
            p.data_vencimento,

            c.nome AS cliente_nome,
            c.telefone,

            strftime(
                '%d/%m/%Y',
                v.data_venda
            ) AS data_compra_br,

            v.data_venda AS data_original,

            (
                SELECT GROUP_CONCAT(
                    iv.quantidade ||
                    'x ' ||
                    prod.nome ||
                    ' — R$ ' ||
                    PRINTF('%.2f', iv.preco_unitario) ||
                    ' cada',
                    ' • '
                )
                FROM itens_venda iv
                JOIN produtos prod
                    ON iv.produto_id = prod.id
                WHERE iv.venda_id = v.id
            ) AS detalhe_produtos,

                        (
                SELECT json_group_array(
                    json_object(
                        'id', pp.id,
                        'numero_parcela', pp.numero_parcela,
                        'valor', pp.valor,
                        'valor_pago', pp.valor_pago,
                        'valor_restante', pp.valor_restante,
                        'data_vencimento', pp.data_vencimento,
                        'status', pp.status
                    )
                )
                FROM (
                    SELECT
                        id,
                        numero_parcela,
                        valor,
                        valor_pago,
                        valor_restante,
                        data_vencimento,
                        status
                    FROM parcelas_pendencia
                    WHERE pendencia_id = p.id
                    ORDER BY numero_parcela ASC
                ) pp
            ) AS parcelas
             

        FROM pendencias p

        INNER JOIN clientes c
            ON p.cliente_id = c.id

        INNER JOIN vendas v
            ON p.venda_id = v.id

        WHERE
            p.status != 'Quitado'
            AND p.valor_restante > 0

        ORDER BY p.id DESC
    `;

    db.all(query, [], (err, rows) => {

        if (err) {

            console.error(
                'Erro na busca de pendências detalhadas:',
                err.message
            );

            return res.status(500).json({
                erro: 'Erro ao buscar pendências.'
            });
        }

        res.json(rows);
    });
});


// =========================================================
// QUITA UMA PENDÊNCIA INTEIRA
// =========================================================
router.post('/:id/quitar', async (req, res) => {

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            erro: 'Pendência inválida.'
        });
    }

    try {

        const pendencia = await get(
            `
            SELECT
                id,
                valor_restante,
                status
            FROM pendencias
            WHERE id = ?
            `,
            [id]
        );

        if (!pendencia) {
            return res.status(404).json({
                erro: 'Pendência não encontrada.'
            });
        }

        if (
            pendencia.valor_restante <= 0 ||
            pendencia.status === 'Quitado'
        ) {
            return res.status(400).json({
                erro: 'Esta pendência já está quitada.'
            });
        }

        await run(
            `
            UPDATE pendencias
            SET
                valor_restante = 0,
                status = 'Quitado'
            WHERE id = ?
            `,
            [id]
        );

        // Também marca todas as parcelas como quitadas.
        await run(
            `
            UPDATE parcelas_pendencia
            SET
                valor_pago = valor,
                valor_restante = 0,
                status = 'Quitada'
            WHERE pendencia_id = ?
            `,
            [id]
        );

        res.json({
            sucesso: true,
            mensagem: 'Pendência quitada com sucesso.'
        });

    } catch (err) {

        console.error(
            'Erro ao quitar pendência:',
            err.message
        );

        res.status(500).json({
            erro: 'Não foi possível quitar a pendência.'
        });
    }
});

// =========================================================
// REGISTRA PAGAMENTO PARCIAL
// Atualiza a pendência e distribui o pagamento
// entre as parcelas em aberto.
// =========================================================
router.post('/:id/parcial', async (req, res) => {

    const id = Number(req.params.id);

    const valor = Number(
        String(req.body.valor ?? '').replace(',', '.')
    );

    if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !Number.isFinite(valor) ||
        valor <= 0
    ) {
        return res.status(400).json({
            erro: 'Informe um valor de pagamento válido.'
        });
    }

    try {

        // -----------------------------------------------------
        // BUSCAR PENDÊNCIA
        // -----------------------------------------------------

        const pendencia = await get(
            `
            SELECT
                id,
                valor_original,
                valor_restante,
                status
            FROM pendencias
            WHERE id = ?
            `,
            [id]
        );

        if (!pendencia) {
            return res.status(404).json({
                erro: 'Pendência não encontrada.'
            });
        }

        if (
            pendencia.status === 'Quitado' ||
            Number(pendencia.valor_restante) <= 0
        ) {
            return res.status(400).json({
                erro: 'Esta pendência já está quitada.'
            });
        }

        const valorPago = Number(
            valor.toFixed(2)
        );

        const restanteAtual = Number(
            Number(pendencia.valor_restante).toFixed(2)
        );

        if (valorPago > restanteAtual) {
            return res.status(400).json({
                erro:
                    `O pagamento não pode ser maior que o saldo de R$ ${restanteAtual.toFixed(2)}.`
            });
        }

        // -----------------------------------------------------
        // BUSCAR PARCELAS EM ABERTO
        // -----------------------------------------------------

        const parcelas = await all(
            `
            SELECT
                id,
                numero_parcela,
                valor,
                valor_pago,
                valor_restante,
                data_vencimento,
                status
            FROM parcelas_pendencia
            WHERE pendencia_id = ?
              AND valor_restante > 0
              AND status != 'Quitada'
            ORDER BY numero_parcela ASC
            `,
            [id]
        );

        if (!parcelas.length) {
            return res.status(400).json({
                erro: 'Nenhuma parcela em aberto foi encontrada para esta pendência.'
            });
        }
                // -----------------------------------------------------
        // DISTRIBUIR O PAGAMENTO
        // -----------------------------------------------------

        let valorDisponivel = valorPago;

        for (const parcela of parcelas) {

            if (valorDisponivel <= 0) {
                break;
            }

            const restanteParcela = Number(
                Number(parcela.valor_restante).toFixed(2)
            );

            const pagamentoParcela = Number(
                Math.min(
                    valorDisponivel,
                    restanteParcela
                ).toFixed(2)
            );

            const novoPago = Number(
                (
                    Number(parcela.valor_pago || 0) +
                    pagamentoParcela
                ).toFixed(2)
            );

            const novoRestanteParcela = Number(
                (
                    restanteParcela -
                    pagamentoParcela
                ).toFixed(2)
            );

            const novoStatusParcela =
                novoRestanteParcela === 0
                    ? 'Quitada'
                    : 'Aberta';

            await run(
                `
                UPDATE parcelas_pendencia
                SET
                    valor_pago = ?,
                    valor_restante = ?,
                    status = ?
                WHERE id = ?
                `,
                [
                    novoPago,
                    novoRestanteParcela,
                    novoStatusParcela,
                    parcela.id
                ]
            );

            valorDisponivel = Number(
                (
                    valorDisponivel -
                    pagamentoParcela
                ).toFixed(2)
            );
        }
                // -----------------------------------------------------
        // ATUALIZAR PENDÊNCIA PRINCIPAL
        // -----------------------------------------------------

        const novoRestante = Number(
            (
                restanteAtual -
                valorPago
            ).toFixed(2)
        );

        const novoStatus =
            novoRestante === 0
                ? 'Quitado'
                : 'Parcial';

        await run(
            `
            UPDATE pendencias
            SET
                valor_restante = ?,
                status = ?
            WHERE id = ?
            `,
            [
                novoRestante,
                novoStatus,
                id
            ]
        );

        // -----------------------------------------------------
        // RETORNAR PARCELAS ATUALIZADAS
        // -----------------------------------------------------

        const parcelasAtualizadas = await all(
            `
            SELECT
                id,
                numero_parcela,
                valor,
                valor_pago,
                valor_restante,
                data_vencimento,
                status
            FROM parcelas_pendencia
            WHERE pendencia_id = ?
            ORDER BY numero_parcela ASC
            `,
            [id]
        );

        res.json({
            sucesso: true,
            valor_pago: valorPago,
            valor_restante: novoRestante,
            status: novoStatus,
            parcelas: parcelasAtualizadas
        });

    } catch (err) {

        console.error(
            'Erro ao registrar pagamento:',
            err.message
        );

        res.status(500).json({
            erro: 'Não foi possível registrar o pagamento.'
        });
    }
});
// =========================================================
// CADASTRAR PENDÊNCIA EXISTENTE
// Não gera venda operacional e não altera estoque.
// =========================================================

router.post('/existente', async (req, res) => {

    const clienteId = Number(req.body.cliente_id);
    const valorTotal = Number(
        String(req.body.valor_total ?? '')
            .replace(',', '.')
    );

    const dataCompra =
        String(req.body.data_compra ?? '').trim();

    const parcelasRecebidas =
        Array.isArray(req.body.parcelas)
            ? req.body.parcelas
            : [];


    // ---------------------------------------------------------
    // VALIDAR CLIENTE
    // ---------------------------------------------------------

    if (
        !Number.isInteger(clienteId) ||
        clienteId <= 0
    ) {

        return res.status(400).json({
            erro: 'Selecione um cliente válido.'
        });

    }


    // ---------------------------------------------------------
    // VALIDAR VALOR
    // ---------------------------------------------------------

    if (
        !Number.isFinite(valorTotal) ||
        valorTotal <= 0
    ) {

        return res.status(400).json({
            erro: 'Informe um valor total válido.'
        });

    }


    // ---------------------------------------------------------
    // VALIDAR PARCELAS
    // ---------------------------------------------------------

    if (!parcelasRecebidas.length) {

        return res.status(400).json({
            erro: 'Informe pelo menos uma parcela.'
        });

    }


    try {

        // -----------------------------------------------------
        // VERIFICAR CLIENTE
        // -----------------------------------------------------

        const cliente = await get(
            `
            SELECT
                id,
                nome,
                telefone
            FROM clientes
            WHERE id = ?
            `,
            [clienteId]
        );


        if (!cliente) {

            return res.status(404).json({
                erro: 'Cliente não encontrado.'
            });

        }


        // -----------------------------------------------------
        // VALIDAR E NORMALIZAR PARCELAS
        // -----------------------------------------------------

        const parcelas = parcelasRecebidas.map(
            (parcela, indice) => {

                const valor =
                    Number(
                        String(
                            parcela.valor ?? ''
                        ).replace(',', '.')
                    );


                const vencimento =
                    String(
                        parcela.data_vencimento ?? ''
                    ).trim();


                if (
                    !Number.isFinite(valor) ||
                    valor <= 0
                ) {

                    throw new Error(
                        `Valor inválido na ${indice + 1}ª parcela.`
                    );

                }


                if (!vencimento) {

                    throw new Error(
                        `Informe o vencimento da ${indice + 1}ª parcela.`
                    );

                }


                return {

                    numero_parcela:
                        indice + 1,

                    valor:
                        Number(
                            valor.toFixed(2)
                        ),

                    data_vencimento:
                        vencimento

                };

            }
        );


        // -----------------------------------------------------
        // CONFERIR TOTAL DAS PARCELAS
        // -----------------------------------------------------

        const somaParcelas =
            Number(
                parcelas
                    .reduce(
                        (total, parcela) =>
                            total + parcela.valor,
                        0
                    )
                    .toFixed(2)
            );


        if (
            Math.abs(
                somaParcelas -
                Number(valorTotal.toFixed(2))
            ) > 0.01
        ) {

            return res.status(400).json({
                erro:
                    'A soma das parcelas deve ser igual ao valor total da pendência.'
            });

        }


        // -----------------------------------------------------
        // CRIAR REGISTRO ADMINISTRATIVO EM VENDAS
        //
        // IMPORTANTE:
        // NÃO criamos itens_venda.
        // Portanto nenhuma rotina de estoque é executada.
        // -----------------------------------------------------

        const venda = await run(
            `
            INSERT INTO vendas (
                cliente_id,
                data_venda,
                total,
                tipo_pagamento
            )
            VALUES (
                ?,
                ?,
                ?,
                ?
            )
            `,
            [
                clienteId,

                dataCompra ||
                    new Date().toISOString(),

                valorTotal,

                'Pendência anterior'
            ]
        );


        const vendaId =
            venda.lastID;


        // -----------------------------------------------------
        // CRIAR PENDÊNCIA
        // -----------------------------------------------------

        const primeiraParcela =
            parcelas[0];


        const pendencia =
            await run(
                `
                INSERT INTO pendencias (
                    cliente_id,
                    venda_id,
                    valor_original,
                    valor_restante,
                    status,
                    numero_parcelas,
                    valor_parcela,
                    data_vencimento
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    clienteId,

                    vendaId,

                    valorTotal,

                    valorTotal,

                    'Aberto',

                    parcelas.length,

                    primeiraParcela.valor,

                    primeiraParcela.data_vencimento
                ]
            );


        const pendenciaId =
            pendencia.lastID;


        // -----------------------------------------------------
        // CRIAR PARCELAS
        // -----------------------------------------------------

        for (
            const parcela of parcelas
        ) {

            await run(
                `
                INSERT INTO parcelas_pendencia (
                    pendencia_id,
                    numero_parcela,
                    valor,
                    valor_pago,
                    valor_restante,
                    data_vencimento,
                    status
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    0,
                    ?,
                    ?,
                    'Aberta'
                )
                `,
                [
                    pendenciaId,

                    parcela.numero_parcela,

                    parcela.valor,

                    parcela.valor,

                    parcela.data_vencimento
                ]
            );

        }


        // -----------------------------------------------------
        // RETORNAR DADOS CRIADOS
        // -----------------------------------------------------

        const parcelasCriadas =
            await all(
                `
                SELECT
                    id,
                    numero_parcela,
                    valor,
                    valor_pago,
                    valor_restante,
                    data_vencimento,
                    status
                FROM parcelas_pendencia
                WHERE pendencia_id = ?
                ORDER BY numero_parcela ASC
                `,
                [pendenciaId]
            );


        res.status(201).json({

            sucesso: true,

            mensagem:
                'Pendência existente cadastrada com sucesso.',

            pendencia: {

                id:
                    pendenciaId,

                cliente_id:
                    clienteId,

                venda_id:
                    vendaId,

                valor_original:
                    valorTotal,

                valor_restante:
                    valorTotal,

                status:
                    'Aberto',

                numero_parcelas:
                    parcelas.length,

                parcelas:
                    parcelasCriadas

            }

        });


    } catch (err) {

        console.error(
            'Erro ao cadastrar pendência existente:',
            err.message
        );


        res.status(500).json({
            erro:
                err.message ||
                'Não foi possível cadastrar a pendência existente.'
        });

    }

});
// =========================================================
// CADASTRAR PENDÊNCIA EXISTENTE / HISTÓRICA
// Não altera o estoque.
// =========================================================

router.post('/existente', async (req, res) => {

    const {
        cliente_id,
        valor_total,
        data_compra,
        parcelas
    } = req.body;


    // -----------------------------------------------------
    // VALIDAR CLIENTE
    // -----------------------------------------------------

    const clienteId =
        Number(cliente_id);


    if (
        !Number.isInteger(clienteId) ||
        clienteId <= 0
    ) {

        return res.status(400).json({
            erro: 'Cliente inválido.'
        });

    }


    // -----------------------------------------------------
    // VALIDAR VALOR
    // -----------------------------------------------------

    const valorTotal =
        Number(valor_total);


    if (
        !Number.isFinite(valorTotal) ||
        valorTotal <= 0
    ) {

        return res.status(400).json({
            erro: 'Valor da pendência inválido.'
        });

    }


    // -----------------------------------------------------
    // VALIDAR PARCELAS
    // -----------------------------------------------------

    if (
        !Array.isArray(parcelas) ||
        parcelas.length === 0
    ) {

        return res.status(400).json({
            erro: 'Informe pelo menos uma parcela.'
        });

    }


    try {

        // -------------------------------------------------
        // VERIFICAR CLIENTE
        // -------------------------------------------------

        const cliente =
            await get(
                `
                SELECT id, nome
                FROM clientes
                WHERE id = ?
                `,
                [clienteId]
            );


        if (!cliente) {

            return res.status(404).json({
                erro: 'Cliente não encontrado.'
            });

        }


        // -------------------------------------------------
        // INICIAR TRANSAÇÃO
        // -------------------------------------------------

        await run('BEGIN TRANSACTION');


        // -------------------------------------------------
        // CRIAR VENDA HISTÓRICA
        //
        // IMPORTANTE:
        // Não criamos itens_venda.
        // Portanto, nenhum produto é retirado do estoque.
        // -------------------------------------------------

        const venda =
            await run(
                `
                INSERT INTO vendas (
                    cliente_id,
                    data_venda,
                    total,
                    tipo_pagamento
                )
                VALUES (?, ?, ?, ?)
                `,
                [
                    clienteId,
                    data_compra || new Date().toISOString(),
                    valorTotal,
                    'Histórico'
                ]
            );


        const vendaId =
            venda.lastID;


        // -------------------------------------------------
        // CRIAR PENDÊNCIA
        // -------------------------------------------------

        const quantidadeParcelas =
            parcelas.length;


        const valorParcelaBase =
            Number(
                (
                    valorTotal /
                    quantidadeParcelas
                ).toFixed(2)
            );


        const pendencia =
            await run(
                `
                INSERT INTO pendencias (
                    cliente_id,
                    venda_id,
                    valor_original,
                    valor_restante,
                    status,
                    numero_parcelas,
                    valor_parcela,
                    data_vencimento
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    clienteId,
                    vendaId,
                    valorTotal,
                    valorTotal,
                    'Aberto',
                    quantidadeParcelas,
                    valorParcelaBase,
                    parcelas[0].data_vencimento || null
                ]
            );


        const pendenciaId =
            pendencia.lastID;


        // -------------------------------------------------
        // CRIAR CADA PARCELA
        // -------------------------------------------------

        for (
            let i = 0;
            i < parcelas.length;
            i++
        ) {

            const parcela =
                parcelas[i];


            const valor =
                Number(parcela.valor);


            if (
                !Number.isFinite(valor) ||
                valor <= 0
            ) {

                throw new Error(
                    `Valor inválido na ${i + 1}ª parcela.`
                );

            }


            await run(
                `
                INSERT INTO parcelas_pendencia (
                    pendencia_id,
                    numero_parcela,
                    valor,
                    valor_pago,
                    valor_restante,
                    data_vencimento,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    pendenciaId,
                    i + 1,
                    valor,
                    0,
                    valor,
                    parcela.data_vencimento || null,
                    'Aberta'
                ]
            );

        }


        // -------------------------------------------------
        // FINALIZAR TRANSAÇÃO
        // -------------------------------------------------

        await run('COMMIT');


        // -------------------------------------------------
        // RESPOSTA
        // -------------------------------------------------

        res.status(201).json({

            sucesso: true,

            mensagem:
                'Pendência histórica cadastrada com sucesso.',

            pendencia_id:
                pendenciaId,

            venda_id:
                vendaId

        });


    } catch (erro) {

        console.error(
            'Erro ao cadastrar pendência existente:',
            erro.message
        );


        // -------------------------------------------------
        // DESFAZER TUDO SE DER ERRO
        // -------------------------------------------------

        try {

            await run('ROLLBACK');

        } catch (rollbackErro) {

            console.error(
                'Erro no rollback:',
                rollbackErro.message
            );

        }


        res.status(500).json({

            erro:
                'Não foi possível cadastrar a pendência existente.'

        });

    }

});


// =========================================================
// EXPORTAR ROTAS
// =========================================================

module.exports = router;
