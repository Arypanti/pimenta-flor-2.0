process.env.TZ = 'America/Sao_Paulo'; // Força o fuso horário correto do Brasil em todo o sistema

const express = require('express');
const path = require('path');
const db = require('./src/database/database');

const app = express();
const PORT = 3000;

// Libera as permissões para o navegador não bloquear as requisições locais
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Configuração essencial para o Node conseguir ler os dados grandes dos relatórios
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ROTA 1: EXCLUSIVA PARA BAIXAR O PDF DE VENDAS DIRETO DO SERVIDOR
app.post('/api/relatorios/vendas/pdf', (req, res) => {
    try {
        const vendas = JSON.parse(req.body.vendas || '[]');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');

        let htmlPDF = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Faturamento Pimenta Flor</title>
            <style>
                body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #333; }
                h1 { color: #c0392b; margin-bottom: 5px; font-size: 28px; }
                .sub { color: #998e83; font-size: 11px; margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #c0392b; color: white; padding: 12px 10px; text-align: left; font-size: 14px; }
                td { padding: 12px 10px; border-bottom: 1px solid #ebe4cb; font-size: 13px; }
                tr:nth-child(even) { background-color: #f9f6f0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>PIMENTA FLOR</h1>
            <div class="sub">Relatório de Faturamento e Fechamento de Caixa</div>
            <hr style="border: 0; border-top: 1px solid #ebe4cb;">
            <table>
                <thead>
                    <tr>
                        <th>ID Venda</th>
                        <th>Data / Hora</th>
                        <th>Cliente</th>
                        <th>Forma Pagamento</th>
                        <th>Valor Total</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (vendas.length > 0) {
            vendas.forEach(v => {
                htmlPDF += `
                    <tr>
                        <td><strong>${v.id || ''}</strong></td>
                        <td>${v.data || ''}</td>
                        <td>${v.cliente || 'Consumidor Final'}</td>
                        <td>${v.pagamento || ''}</td>
                        <td style="color: #2ecc71; font-weight: bold;">${v.total || ''}</td>
                    </tr>
                `;
            });
        } else {
            htmlPDF += `<tr><td colspan="5" style="text-align: center; color: #777;">Nenhuma venda encontrada para o período.</td></tr>`;
        }

        htmlPDF += `
                </tbody>
            </table>
            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 500);
                }
            </script>
        </body>
        </html>
        `;
        res.send(htmlPDF);
    } catch (err) {
        console.error("Erro ao gerar PDF de vendas:", err);
        res.status(500).send("Erro interno ao gerar o PDF de vendas.");
    }
});

// ROTA 2: EXCLUSIVA PARA BAIXAR O PDF DO ESTOQUE DIRETO DO SERVIDOR
app.post('/api/relatorios/estoque/pdf', (req, res) => {
    try {
        const estoque = JSON.parse(req.body.estoque || '[]');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');

        let htmlPDF = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Estoque Pimenta Flor</title>
            <style>
                body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #333; }
                h1 { color: #c0392b; margin-bottom: 5px; font-size: 28px; }
                .sub { color: #998e83; font-size: 11px; margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #c0392b; color: white; padding: 12px 10px; text-align: left; font-size: 14px; }
                td { padding: 12px 10px; border-bottom: 1px solid #ebe4cb; font-size: 13px; }
                tr:nth-child(even) { background-color: #f9f6f0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>PIMENTA FLOR</h1>
            <div class="sub">Relatório de Posição Atual do Estoque</div>
            <hr style="border: 0; border-top: 1px solid #ebe4cb;">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Produto</th>
                        <th>Preço Unitário</th>
                        <th>Qtd. em Estoque</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (estoque.length > 0) {
            estoque.forEach(p => {
                htmlPDF += `
                    <tr>
                        <td><strong>${p.id || ''}</strong></td>
                        <td>${p.nome || ''}</td>
                        <td>${p.preco || ''}</td>
                        <td>${p.qtd || ''}</td>
                        <td>${p.status || ''}</td>
                    </tr>
                `;
            });
        } else {
            htmlPDF += `<tr><td colspan="5" style="text-align: center; color: #777;">Nenhum produto listado no estoque.</td></tr>`;
        }

        htmlPDF += `
                </tbody>
            </table>
            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 500);
                }
            </script>
        </body>
        </html>
        `;
        res.send(htmlPDF);
    } catch (err) {
        console.error("Erro ao gerar PDF do estoque:", err);
        res.status(500).send("Erro interno ao gerar o PDF do estoque.");
    }
});

// ROTA 3: BUSCA OS PRODUTOS NO BANCO DIRETAMENTE PARA O RELATÓRIO
app.get('/api/relatorios/estoque/dados', (req, res) => {
    const query = `SELECT id, nome, preco, quantidade_estoque FROM produtos ORDER BY nome ASC`;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("Erro ao buscar estoque para relatório:", err.message);
            return res.status(500).json({ erro: "Erro ao buscar dados." });
        }
        res.json(rows);
    });
});
// Rota para o Dashboard buscar os números em tempo real (Corrigido o bug do 'localtime' que zerava os dados)
app.get('/api/dashboard/resumo', (req, res) => {
   const hoje = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo'
});

const queryVendas = `
    SELECT SUM(total) as total_dia, COUNT(*) as qtd_vendas
    FROM vendas
    WHERE DATE(data_venda) = DATE(?)
`;
    const queryBaixoEstoque = `
    SELECT COUNT(*) as baixo_estoque
    FROM produtos
    WHERE quantidade_estoque < 5
`;
    const queryPendencias = `SELECT SUM(valor_restante) as total_pendente FROM pendencias WHERE status != 'Quitado'`;
    const queryTotalClientes = `SELECT COUNT(*) as total_clientes FROM clientes`;
    const queryTotalProdutos = `SELECT COUNT(*) as total_produtos FROM produtos`;

    db.get(queryVendas, [hoje], (err, v) => {
        db.get(queryBaixoEstoque, [], (err, be) => {
            db.get(queryPendencias, [], (err, p) => {
                db.get(queryTotalClientes, [], (err, tc) => {
                    db.get(queryTotalProdutos, [], (err, tp) => {
                        res.json({
                            vendas_dia: v?.total_dia || 0,
                            qtd_vendas: v?.qtd_vendas || 0,
                            baixo_estoque: be?.baixo_estoque || 0,
                            total_pendente: p?.total_pendente || 0,
                            total_clientes: tc?.total_clientes || 0,
                            total_produtos: tp?.total_produtos || 0
                        });
                    });
                });
            });
        });
    });
});


app.get('/api/relatorios/vendas/historico', (req,res)=>{
 const {busca='',data_inicio='',data_fim=''}=req.query;
 let q=`SELECT v.id,v.data_venda,v.total,v.tipo_pagamento,c.nome AS cliente_nome FROM vendas v LEFT JOIN clientes c ON v.cliente_id=c.id WHERE 1=1`, p=[];
 if(data_inicio){q+=` AND DATE(v.data_venda,'localtime')>=DATE(?)`;p.push(data_inicio)}
 if(data_fim){q+=` AND DATE(v.data_venda,'localtime')<=DATE(?)`;p.push(data_fim)}
 if(busca){q+=` AND (LOWER(COALESCE(c.nome,'')) LIKE LOWER(?) OR CAST(v.id AS TEXT)=?)`;p.push(`%${busca}%`,busca)}
 q+=` ORDER BY datetime(v.data_venda) DESC,v.id DESC`;
 db.all(q,p,(e,vendas)=>{
  if(e)return res.status(500).json({erro:'Erro ao buscar histórico.'});
  if(!vendas.length)return res.json({vendas:[],resumo:{qtd_vendas:0,faturamento:0,qtd_itens:0}});
  const ids=vendas.map(v=>v.id), ph=ids.map(()=>'?').join(',');
  db.all(`SELECT iv.venda_id,iv.quantidade,iv.preco_unitario,COALESCE(p.nome,'Produto removido') AS nome FROM itens_venda iv LEFT JOIN produtos p ON p.id=iv.produto_id WHERE iv.venda_id IN (${ph}) ORDER BY iv.venda_id DESC,iv.id ASC`,ids,(ei,itens)=>{
   if(ei)return res.status(500).json({erro:'Erro ao buscar itens.'});
   const m={};vendas.forEach(v=>m[v.id]=[]);itens.forEach(i=>m[i.venda_id].push(i));
   const out=vendas.map(v=>({...v,itens:m[v.id]}));
   res.json({vendas:out,resumo:{qtd_vendas:out.length,faturamento:out.reduce((a,v)=>a+Number(v.total||0),0),qtd_itens:itens.reduce((a,i)=>a+Number(i.quantidade||0),0)}});
  });
 });
});


// ROTAS DE VISUALIZAÇÃO (HTML)

app.get('/produtos/novo', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'produto-form.html'));
});
app.get('/produtos/:id/editar', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'produto-form.html'));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/clientes', (req, res) => res.sendFile(path.join(__dirname, 'views', 'clientes.html')));
app.get('/produtos', (req, res) => res.sendFile(path.join(__dirname, 'views', 'produtos.html')));
app.get('/vendas', (req, res) => res.sendFile(path.join(__dirname, 'views', 'vendas.html')));
app.get('/pendencias', (req, res) => res.sendFile(path.join(__dirname, 'views', 'pendencias.html')));
app.get('/relatorios/vendas', (req, res) => res.sendFile(path.join(__dirname, 'views', 'relatorio-vendas.html')));
app.get('/relatorios/estoque', (req, res) => res.sendFile(path.join(__dirname, 'views', 'relatorio-estoque.html')));
app.get('/relatorios/pendencias', (req, res) => res.sendFile(path.join(__dirname, 'views', 'relatorio-pendencias.html')));
app.get('/vendas/historico', (req, res) => res.sendFile(path.join(__dirname, 'views', 'historico-vendas.html')));
app.get('/relatorios/vendas/historico', (req, res) => res.sendFile(path.join(__dirname, 'views', 'historico-vendas.html')));


// APIS DO BANCO DE DADOS
app.use('/api/clientes', require('./src/routes/clientes'));
app.use('/api/produtos', require('./src/routes/produtos'));
app.use('/api/vendas', require('./src/routes/vendas'));
app.use('/api/pendencias', require('./src/routes/pendencias'));

// ROTA COLETORA: Busca os saldos, calcula prazos e junta a descrição os itens levados
app.get('/api/relatorios/pendencias/dados', (req, res) => {
    const query = `
        SELECT 
            p.id,
            p.status,
            p.valor_restante,
            p.data_vencimento,
            c.nome as cliente_nome,
            c.telefone as cliente_telefone,
            v.id as venda_id,
            v.data_venda as data_original,
            strftime('%d/%m/%Y', v.data_venda) as data_compra_br,
            (
                SELECT group_concat(prod.nome || ' (x' || iv.quantidade || ')', ', ')
                FROM itens_venda iv
                JOIN produtos prod ON iv.produto_id = prod.id
                WHERE iv.venda_id = v.id
            ) as detalhe_produtos
        FROM pendencias p
        JOIN clientes c ON p.cliente_id = c.id
        JOIN vendas v ON p.venda_id = v.id
        WHERE p.status != 'Quitado' AND p.valor_restante > 0
        ORDER BY v.data_venda DESC
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("Erro na query de pendências do servidor:", err.message);
            return res.status(500).json({ erro: "Erro ao buscar dados das pendências." });
        }
        res.json(rows);
    });
});

// ROTA: Processa os dados e abre a janela de salvamento do PDF das dívidas
app.post('/api/relatorios/pendencias/pdf', (req, res) => {
    try {
        const pendencias = JSON.parse(req.body.pendencias || '[]');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');

        let htmlPDF = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Relatório de Pendências</title>
            <style>
                body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #333; }
                h1 { color: #c0392b; margin-bottom: 5px; font-size: 28px; }
                .sub { color: #998e83; font-size: 11px; margin-bottom: 25px; text-transform: uppercase; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #c0392b; color: white; padding: 12px 10px; text-align: left; }
                td { padding: 12px 10px; border-bottom: 1px solid #ebe4cb; }
                tr:nth-child(even) { background-color: #f9f6f0; }
            </style>
        </head>
        <body>
            <h1>PIMENTA FLOR</h1>
            <div class="sub">Relatório de Valores a Receber de Clientes</div>
            <hr style="border: 0; border-top: 1px solid #ebe4cb;">
            <table>
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>O que levou</th>
                        <th>Valor original</th>
                        <th>Pago</th>
                        <th>Saldo restante</th>
                        <th>Situação</th>
                    </tr>
                </thead>
                <tbody>
        `;

        pendencias.forEach(p => {
            htmlPDF += `
                <tr>
                    <td><strong>${p.cliente}</strong></td>
                    <td>${p.telefone}</td>
                    <td style="color: #c0392b; font-weight: bold;">${p.saldo}</td>
                    <td>${p.situacao}</td>
                </tr>
            `;
        });

        htmlPDF += `
                </tbody>
            </table>
            <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>
        </body>
        </html>
        `;
        res.send(htmlPDF);
    } catch (err) {
        res.status(500).send("Erro ao gerar relatório.");
    }
});

// Inicializa o servidor local
app.listen(PORT, () => {
    console.log(`Sistema Pimenta Flor rodando com sucesso na porta ${PORT}!`);
});