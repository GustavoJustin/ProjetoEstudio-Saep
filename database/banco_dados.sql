CREATE DATABASE IF NOT EXISTS estudio;
USE  estudio;

CREATE TABLE usuarios(
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL
);

CREATE TABLE clientes(
    id_cliente INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    cpf VARCHAR(255) NOT NULL    
);

CREATE TABLE projeto_tatuagem(
    id_projeto INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    estilo_arte VARCHAR(100) NOT NULL,
    tamanho VARCHAR(50),
    arte VARCHAR(100),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id_cliente)
);

CREATE TABLE sessao(
    id_sessao INT AUTO_INCREMENT PRIMARY KEY,
    projeto_tatuagem_id INT NOT NULL,
    data_agendamento DATETIME NOT NULL,
    servico VARCHAR(100),
    FOREIGN KEY (projeto_tatuagem_id) REFERENCES projeto_tatuagem(id_projeto)
);

INSERT INTO usuarios(nome, email, senha) VALUES
('Administrador', 'admin@oficina.com', '$2b$10$mDHyxGWwZfFPA1j5x4giaeCyDFkMax0YNecXFwaAz9wX8xtjndcmm'),
('Carlos Mecanico', 'carlos@oficina.com', '$2b$10$mDHyxGWwZfFPA1j5x4giaeCyDFkMax0YNecXFwaAz9wX8xtjndcmm'),
('Fernanda Atendente', 'fernanda@oficina.com', '$2b$10$mDHyxGWwZfFPA1j5x4giaeCyDFkMax0YNecXFwaAz9wX8xtjndcmm');

INSERT INTO clientes(nome, email, cpf) VALUES
('João da Sailva', 'joao.silva@email.com', '143258aaf546a49c857215f74822e800'),
('Maria Souza', 'maria.souza@email.com', '6ede5a9078ef6d50ae2b1cd07829435b'),
('Pedro Oliveira', 'pedro.oliveira@email.com', 'd11d16f767378013c69b152ae3225fb2');

INSERT INTO projeto_tatuagem(cliente_id, estilo_arte, tamanho, arte) VALUES
(1, 'Cartoon', 'Medio', 'Bob Esponja'),
(2, 'Pixelado', 'Grande', 'Charizard'),
(3, 'Normal', 'Pequeno', 'Borboleta');

INSERT INTO sessao(projeto_tatuagem_id, data_agendamento, servico) VALUES
(2, '2026-11-05 09:00:00', 'Troca de oleo'),
(1, '2026-10-20 14:30:00', 'Alinhamento e balanceamento'),
(3, '2026-10-20 00:00:00', 'Revisao dos freios');