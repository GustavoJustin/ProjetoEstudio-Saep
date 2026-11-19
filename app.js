require('dotenv').config();
const fs = require("fs");
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const Mustache = require('mustache');

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.use((req, res, next) => {
    const metodo = String(req.body?._method || '').toUpperCase() //Se não achar o req.body ele retorna uma string vazia
    if(req.method === 'POST' && ['PUT', 'DELETE'].includes(metodo)) {
        req.method = metodo
    }
    next()
})

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true
})

// mostrar clientes
function mostrar(nome, dados = {}) {
    const arquivo = path.join(__dirname, 'paginas', `${nome}.html`)
    return Mustache.render(fs.readFileSync(arquivo, 'utf8'), dados)
}

function criptografar(texto) {
    const cifra = crypto.createCipheriv(
        'aes-256-cbc', 
        process.env.CRIPTO_CHAVE,
        process.env.CRIPTO_IV
    )
    return cifra.update(texto, 'utf8', 'hex') + cifra.final('hex')
}

function descriptografar(texto) {
    const decifra = crypto.createDecipheriv(
        'aes-256-cbc', 
        process.env.CRIPTO_CHAVE,
        process.env.CRIPTO_IV
    )
    return decifra.update(texto, 'hex', 'utf8') + decifra.final('utf8')
}

async function excluir(res, tabela, id, volta, motivo) {
    try {
        await db.query(`DELETE FROM ${tabela} WHERE id = ?`, [id])
        res.redirect(volta)
    } catch(erro){
        if(erro.code === "ER_ROW_IS_REFERENCE_2") {
            return res.status(409).send(`<p>Não foi possivel excluir: ${motivo}</p> <p><a href="${volta}">Voltar</a></p>`)
        }

        console.error(erro)
        res.status(500).send(`<p> Erro ao excluir. </p> <p><a href="${volta}">Voltar</a></p>`)
    }
}

//mostrar projetos de tatuagem
async function mostrarProjetos(req, res, erro = "") {
    const [projetos] = await db.query("SELECT * FROM projeto_tatuagem")
    const [listarClientes] = await db.query("SELECT id, nome FROM clientes")
    const editar = projetos.find((v) => String(v.id) === req.query.editar)

    const clientes = listarClientes.map((cliente) => ({
        ...cliente,
        selecionado: editar && cliente.id === editar.cliente_id ? "selected" : "",
    }))

    res.send(
        mostrar("projetos", {
            projetos,
            clientes,
            erro,
            editando: Boolean(editar),
            acao: editar ? `/projetos/${editar.id}` : "/projetos",
            form: editar || {},
        })
    )
}


//===============================================PARTE LOGIN===============================================
app.get('/', (req, res) => res.send(mostrar("login")))

app.post('/login', async(req, res) => {
    const {email, senha} = req.body
    const [usuarios] = await db.query('SELECT * FROM usuarios WHERE EMAIL = ?', [email])
    const usuario = usuarios[0]

    if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
        return res.send(mostrar('login', {erro: 'Email ou senha inválidos'}))
    }

    const token = jwt.sign(
        {id: usuario.id, nome: usuario.nome}, 
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    )
    res.cookie('token', token, {httpOnly: true})
    res.redirect('/principal')
})

app.post('/sair', (req, res) => {
    res.clearCookie('token')
    res.redirect('/')
})

app.use((req, res, next) => {
    try {
        req.usuario = jwt.verify(req.cookies.token, process.env.JWT_SECRET)
        next()
    } catch(e){
        res.redirect('/')
    }
})


//===============================================PARTE PRINCIPAL===============================================
app.get("/principal", (req, res) => res.send(mostrar("principal", { nome: req.usuario.nome })))


//===============================================PARTE CLIENTES===============================================
app.get("/clientes", async (req, res) => {
    const busca = req.query.busca || ""
    const [lista] = await db.query("SELECT * FROM clientes WHERE nome LIKE ?", [`%${busca}%`])

    const clientes = lista.map((cliente) => ({
        ...cliente,
        cpf: descriptografar(cliente.cpf)
    }))

    const editar = clientes.find((cliente) => String(cliente.id) === req.query.editar)

    res.send(
        mostrar('clientes', { 
            busca, 
            clientes, 
            editando: Boolean(editar), 
            acao: editar ? `/clientes/${editar.id}` : '/clientes', 
            form: editar || {},
        })
    )
})

app.post('/clientes', async(req, res) => {
    const { nome, email, cpf } = req.body
    await db.query(
        'INSERT INTO clientes (nome, email, cpf) VALUE (?,?,?)',
        [nome, email, criptografar(cpf)]
    )
    res.redirect('/clientes')
})

app.put('/clientes/:id', async(req, res) => {
    const { nome, email, cpf } = req.body
    await db.query(
        "UPDATE clientes SET nome = ?, email = ?, cpf = ? WHERE id = ?",
        [nome, email, criptografar(cpf), req.params.id]
    )
    res.redirect('/clientes')
})

app.delete('/clientes/:id', async(req, res) => {
    await excluir(res,'clientes', req.params.id, '/clientes', 'O cliente ja possui projetos cadastrados')
})


//===============================================PARTE PROJETOS===============================================
app.get('/projetos', (req, res) => mostrarProjetos(req,res))

app.post('/projetos', async(req, res) => {
    const { cliente_id, estilo_arte, tamanho, arte } = req.body
    if(!cliente_id) {
        return mostrarProjetos(req, res, "Cliente ID é obrigatório")
    }
    await db.query(
        "INSERT INTO projeto_tatuagem(cliente_id, estilo_arte, tamanho, arte) VALUES (?,?,?,?)",
        [cliente_id, estilo_arte, tamanho, arte || null]
    )
    res.redirect("/projetos")
})

app.put('/projetos/:id', async (req, res) => {
    const {cliente_id, estilo_arte, tamanho, arte} = req.body

    if(!cliente_id) return mostrarProjetos(req, res, 'cliente_id e obrigatorio.')
    
    await db.query('UPDATE projeto_tatuagem SET cliente_id = ?, estilo_arte = ?, tamanho = ?, arte = ? WHERE id = ?', [cliente_id, estilo_arte, tamanho, arte, req.params.id])

    res.redirect('/projetos')
})

app.delete('/projetos/:id', async(req, res) => {
    await excluir(res, 'projetos', req.params.id, '/projetos', 'O projeto possui agendamentos de sessao')
})


//===============================================PARTE AGENDAMENTO PROJETOS===============================================
app.get('/agendamentos', async (req, res) => {
    const [lista] = await db.query('SELECT agendamento_sessao.*, projeto_tatuagem.estilo_arte, projeto_tatuagem.tamanho, projeto_tatuagem.arte, clientes.nome AS clientes_nome FROM agendamento_sessao JOIN projeto_tatuagem ON projeto_tatuagem.id_projeto = agendamento_sessao.projeto_tatuagem_id JOIN clientes ON clientes.id_cliente = projeto_tatuagem.cliente_id ORDER BY agendamento_sessao.data_agendamento') //Mudar "agendamento.data_agendamento" para como voce quer ordenar a lista

    const [projetos] = await db.query('SELECT * FROM projeto_tatuagem')

    const agendamentos = lista.map((a) => ({
        ...a,
        data_br: new Date(a.data_agendamento).toLocaleString('pt-BR'),
        data_input: a.data_agendamento.slice(0,16).replace(' ', 'T')
    }))

    res.send(mostrar('agendamentos',{agendamentos, projetos}))
})

app.post('/agendamentos', async (req, res) => {
    const {projeto_tatuagem_id, data_agendamento, servico} = req.body

    await db.query('INSERT INTO agendamento_sessao (projeto_tatuagem_id, data_agendamento, servico) VALUES (?,?,?)', [projeto_tatuagem_id, data_agendamento.replace('T', ' '), servico])

    res.redirect('/agendamentos')
})

app.put('/agendamentos/:id', async (req, res) => {
    await db.query('UPDATE agendamento_sessao SET data_agendamento = ? WHERE id = ?', [req.body.data_agendamento.replace('T', ' '), req.params.id])

    res.redirect('/agendamentos')
})

app.delete('/agendamentos/:id', async (req, res) => {
    await excluir(res, 'agendamento', req.params.id, '/agendamentos', '')
})


//===============================================FIM===============================================
const porta = process.env.PORT || 3000;
app.listen(porta, () => {
    console.log(`Estudio rodando em http://localhost:${porta}`)
})