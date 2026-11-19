
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const Mustache = require('mustache');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


//===============================================
// CONEXÃO COM BANCO DE DADOS
//===============================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true
});


//===============================================
// MÉTODO PUT E DELETE
//===============================================

app.use((req, res, next) => {

    const metodo = String(req.body?._method || '').toUpperCase();

    if (req.method === 'POST' && ['PUT', 'DELETE'].includes(metodo)) {
        req.method = metodo;
    }

    next();
});


//===============================================
// MOSTRAR ARQUIVOS HTML
//===============================================

function mostrar(nome, dados = {}) {

    const arquivo = path.join(
        __dirname,
        'paginas',
        `${nome}.html`
    );

    return Mustache.render(
        fs.readFileSync(arquivo, 'utf8'),
        dados
    );
}


//===============================================
// CRIPTOGRAFIA DO CPF
//===============================================

function criptografar(texto) {

    const cifra = crypto.createCipheriv(
        'aes-256-cbc',
        process.env.CRIPTO_CHAVE,
        process.env.CRIPTO_IV
    );

    return cifra.update(texto, 'utf8', 'hex') + cifra.final('hex');
}


function descriptografar(texto) {

    const decifra = crypto.createDecipheriv(
        'aes-256-cbc',
        process.env.CRIPTO_CHAVE,
        process.env.CRIPTO_IV
    );

    return decifra.update(texto, 'hex', 'utf8') + decifra.final('utf8');
}


//===============================================
// FUNÇÃO DE EXCLUSÃO
//===============================================

async function excluir(res, tabela, colunaId, id, volta, motivo) {

    try {

        await db.query(
            `DELETE FROM ${tabela} WHERE ${colunaId} = ?`,
            [id]
        );

        res.redirect(volta);

    } catch (erro) {

        if (erro.code === 'ER_ROW_IS_REFERENCED_2') {

            return res.status(409).send(`
                <p>Não foi possível excluir: ${motivo}</p>
                <p><a href="${volta}">Voltar</a></p>
            `);

        }

        console.error('Erro ao excluir:', erro);

        res.status(500).send('Erro ao excluir registro.');

    }
}


//===============================================
// LOGIN
//===============================================

app.get('/', (req, res) => {

    res.send(mostrar('login'));

});


app.post('/login', async (req, res) => {

    try {

        const { email, senha } = req.body;

        const [usuarios] = await db.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );

        const usuario = usuarios[0];

        if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {

            return res.send(
                mostrar('login', {
                    erro: 'Email ou senha inválidos'
                })
            );

        }

        const token = jwt.sign(
            {
                id: usuario.id_usuario,
                nome: usuario.nome
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            sameSite: 'lax'
        });

        res.redirect('/principal');

    } catch (erro) {

        console.error('Erro no login:', erro);

        res.status(500).send('Erro ao realizar login.');

    }

});


//===============================================
// AUTENTICAÇÃO
//===============================================

app.use((req, res, next) => {

    try {

        const token = req.cookies?.token;

        if (!token) {
            return res.redirect('/');
        }

        req.usuario = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        next();

    } catch (erro) {

        res.clearCookie('token');

        return res.redirect('/');

    }

});


//===============================================
// SAIR
//===============================================

app.post('/sair', (req, res) => {

    res.clearCookie('token');

    res.redirect('/');

});


//===============================================
// PÁGINA PRINCIPAL
//===============================================

app.get('/principal', (req, res) => {

    res.send(
        mostrar('principal', {
            nome: req.usuario.nome
        })
    );

});


//===============================================
// CLIENTES
//===============================================

// Listar clientes

app.get('/clientes', async (req, res) => {

    try {

        const busca = req.query.busca || '';

        const [lista] = await db.query(
            `SELECT
                id_cliente AS id,
                nome,
                email,
                cpf
            FROM clientes
            WHERE nome LIKE ?`,
            [`%${busca}%`]
        );

        const clientes = lista.map(cliente => ({
            ...cliente,
            cpf: descriptografar(cliente.cpf)
        }));

        const editar = clientes.find(
            cliente => String(cliente.id) === req.query.editar
        );

        res.send(
            mostrar('clientes', {

                buscar: busca,

                clientes,

                editando: Boolean(editar),

                acao: editar
                    ? `/clientes/${editar.id}`
                    : '/clientes',

                form: editar || {}

            })
        );

    } catch (erro) {

        console.error('Erro ao carregar clientes:', erro);

        res.status(500).send('Erro ao carregar clientes.');

    }

});


// Cadastrar cliente

app.post('/clientes', async (req, res) => {

    try {

        const { nome, email, cpf } = req.body;

        await db.query(
            `INSERT INTO clientes
            (nome, email, cpf)
            VALUES (?, ?, ?)`,
            [
                nome,
                email,
                criptografar(cpf)
            ]
        );

        res.redirect('/clientes');

    } catch (erro) {

        console.error('Erro ao cadastrar cliente:', erro);

        res.status(500).send('Erro ao cadastrar cliente.');

    }

});


// Editar cliente

app.put('/clientes/:id', async (req, res) => {

    try {

        const { nome, email, cpf } = req.body;

        await db.query(
            `UPDATE clientes
            SET nome = ?, email = ?, cpf = ?
            WHERE id_cliente = ?`,
            [
                nome,
                email,
                criptografar(cpf),
                req.params.id
            ]
        );

        res.redirect('/clientes');

    } catch (erro) {

        console.error('Erro ao atualizar cliente:', erro);

        res.status(500).send('Erro ao atualizar cliente.');

    }

});


// Excluir cliente

app.delete('/clientes/:id', async (req, res) => {

    await excluir(
        res,
        'clientes',
        'id_cliente',
        req.params.id,
        '/clientes',
        'O cliente já possui projetos cadastrados.'
    );

});


//===============================================
// PROJETOS
//===============================================

// Mostrar projetos

async function mostrarProjetos(req, res, erro = '') {

    try {

        const [projetos] = await db.query(`
            SELECT
                p.id_projeto AS id,
                p.cliente_id,
                p.estilo_arte,
                p.tamanho,
                p.arte,
                c.nome AS clientes_nome

            FROM projeto_tatuagem p

            INNER JOIN clientes c
                ON c.id_cliente = p.cliente_id

            ORDER BY p.id_projeto
        `);


        const [listarClientes] = await db.query(`
            SELECT
                id_cliente AS id,
                nome
            FROM clientes
            ORDER BY nome
        `);


        const editar = projetos.find(
            projeto => String(projeto.id) === req.query.editar
        );


        const clientes = listarClientes.map(cliente => ({

            ...cliente,

            selecionado:
                editar &&
                String(cliente.id) === String(editar.cliente_id)
                    ? 'selected'
                    : ''

        }));


        res.send(
            mostrar('projetos_sessao', {

                projetos,

                clientes,

                erro,

                editando: Boolean(editar),

                acao: editar
                    ? `/projetos/${editar.id}`
                    : '/projetos',

                form: editar || {}

            })
        );

    } catch (erro) {

        console.error('ERRO COMPLETO AO CARREGAR PROJETOS:');
        console.error(erro);

        res.status(500).send(`
            <h2>Erro ao carregar projetos.</h2>
            <p>${erro.message}</p>
        `);

    }

}


// Listar projetos

app.get('/projetos', (req, res) => {

    mostrarProjetos(req, res);

});


// Cadastrar projeto

app.post('/projetos', async (req, res) => {

    try {

        const {
            cliente_id,
            estilo_arte,
            tamanho,
            arte
        } = req.body;


        if (!cliente_id) {

            return mostrarProjetos(
                req,
                res,
                'Selecione um cliente.'
            );

        }


        await db.query(
            `INSERT INTO projeto_tatuagem
            (cliente_id, estilo_arte, tamanho, arte)
            VALUES (?, ?, ?, ?)`,
            [
                cliente_id,
                estilo_arte,
                tamanho || null,
                arte || null
            ]
        );


        res.redirect('/projetos');

    } catch (erro) {

        console.error('Erro ao cadastrar projeto:', erro);

        res.status(500).send('Erro ao cadastrar projeto.');

    }

});


// Editar projeto

app.put('/projetos/:id', async (req, res) => {

    try {

        const {
            cliente_id,
            estilo_arte,
            tamanho,
            arte
        } = req.body;


        if (!cliente_id) {

            return mostrarProjetos(
                req,
                res,
                'Selecione um cliente.'
            );

        }


        await db.query(
            `UPDATE projeto_tatuagem
            SET cliente_id = ?,
                estilo_arte = ?,
                tamanho = ?,
                arte = ?
            WHERE id_projeto = ?`,
            [
                cliente_id,
                estilo_arte,
                tamanho || null,
                arte || null,
                req.params.id
            ]
        );


        res.redirect('/projetos');

    } catch (erro) {

        console.error('Erro ao atualizar projeto:', erro);

        res.status(500).send('Erro ao atualizar projeto.');

    }

});


// Excluir projeto

app.delete('/projetos/:id', async (req, res) => {

    await excluir(
        res,
        'projeto_tatuagem',
        'id_projeto',
        req.params.id,
        '/projetos',
        'O projeto possui agendamentos de sessão.'
    );

});


// Compatibilidade com endereço antigo

app.get('/veiculos', (req, res) => {

    res.redirect('/projetos');

});


//===============================================
// AGENDAMENTOS DE SESSÃO
//===============================================

// Mostrar agendamentos

async function mostrarAgendamentos(req, res, erro = '') {

    try {

        const [lista] = await db.query(`
            SELECT
                a.id_sessao AS id,
                a.projeto_tatuagem_id,
                a.data_agendamento,
                a.servico,
                p.estilo_arte,
                p.tamanho,
                p.arte,
                c.nome AS clientes_nome

            FROM agendamento_sessao a

            INNER JOIN projeto_tatuagem p
                ON p.id_projeto = a.projeto_tatuagem_id

            INNER JOIN clientes c
                ON c.id_cliente = p.cliente_id

            ORDER BY a.data_agendamento
        `);


        const [projetos] = await db.query(`
            SELECT
                id_projeto AS id,
                estilo_arte,
                tamanho,
                arte
            FROM projeto_tatuagem
        `);


        const agendamentos = lista.map(a => ({

            ...a,

            data_br: new Date(
                a.data_agendamento.replace(' ', 'T')
            ).toLocaleString('pt-BR'),

            data_input: a.data_agendamento
                .slice(0, 16)
                .replace(' ', 'T')

        }));


        res.send(
            mostrar('agendamento_sessao', {

                agendamentos,

                projetos,

                erro

            })
        );

    } catch (erro) {

        console.error('ERRO COMPLETO AO CARREGAR AGENDAMENTOS:');
        console.error(erro);

        res.status(500).send(`
            <h2>Erro ao carregar agendamentos.</h2>
            <p>${erro.message}</p>
        `);

    }

}


// Listar agendamentos

app.get('/agendamentos', (req, res) => {

    mostrarAgendamentos(req, res);

});


// Cadastrar agendamento

app.post('/agendamentos', async (req, res) => {

    try {

        // Aceita os dois nomes para compatibilidade
        // com versões anteriores do HTML.

        const projeto_tatuagem_id =
            req.body.projeto_tatuagem_id || req.body.projeto_id;

        const {
            data_agendamento,
            servico
        } = req.body;


        if (!projeto_tatuagem_id || !data_agendamento) {

            return mostrarAgendamentos(
                req,
                res,
                'Projeto e data são obrigatórios.'
            );

        }


        await db.query(
            `INSERT INTO agendamento_sessao
            (projeto_tatuagem_id, data_agendamento, servico)
            VALUES (?, ?, ?)`,
            [
                projeto_tatuagem_id,
                data_agendamento.replace('T', ' '),
                servico || null
            ]
        );


        res.redirect('/agendamentos');

    } catch (erro) {

        console.error('Erro ao cadastrar agendamento:', erro);

        res.status(500).send('Erro ao cadastrar agendamento.');

    }

});


// Editar agendamento

app.put('/agendamentos/:id', async (req, res) => {

    try {

        const { data_agendamento, servico } = req.body;

        if (!data_agendamento) {

            return mostrarAgendamentos(
                req,
                res,
                'A data do agendamento é obrigatória.'
            );

        }


        await db.query(
            `UPDATE agendamento_sessao
            SET data_agendamento = ?
            WHERE id_sessao = ?`,
            [
                data_agendamento.replace('T', ' '),
                req.params.id
            ]
        );


        res.redirect('/agendamentos');

    } catch (erro) {

        console.error('Erro ao atualizar agendamento:', erro);

        res.status(500).send('Erro ao atualizar agendamento.');

    }

});


// Excluir agendamento

app.delete('/agendamentos/:id', async (req, res) => {

    await excluir(
        res,
        'agendamento_sessao',
        'id_sessao',
        req.params.id,
        '/agendamentos',
        ''
    );

});


//===============================================
// TRATAMENTO DE ROTAS NÃO ENCONTRADAS
//===============================================

app.use((req, res) => {

    res.status(404).send('Página não encontrada.');

});


//===============================================
// INICIAR SERVIDOR
//===============================================

const porta = process.env.PORT || 3000;

app.listen(porta, () => {

    console.log(`Estudio rodando em http://localhost:${porta}`);

});
