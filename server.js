import dotenv from 'dotenv';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Configuração inicial
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const GROQ_URL =
  'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODEL = 'openai/gpt-oss-20b';

// Middlewares
app.use(express.json({ limit: '20kb' }));

app.use(
  express.static(path.join(__dirname, 'public'))
);

// Banco em memória
const users = new Map();
const sessions = new Map();

// Segurança das senhas
const hashSenha = (
  senha,
  salt = crypto.randomBytes(16).toString('hex')
) => ({
  salt,
  hash: crypto.scryptSync(senha, salt, 64).toString('hex')
});

const senhaOk = (senha, usuario) => {
  const hash = crypto.scryptSync(
    senha,
    usuario.salt,
    64
  );

  const armazenado = Buffer.from(
    usuario.hash,
    'hex'
  );

  return crypto.timingSafeEqual(hash, armazenado);
};

// Autenticação
const auth = (req, res, next) => {
  const cabecalho = req.headers.authorization || '';

  const token = cabecalho.startsWith('Bearer ')
    ? cabecalho.slice(7)
    : '';

  const email = sessions.get(token);

  if (!email || !users.has(email)) {
    return res.status(401).json({
      erro: 'Sessão expirada. Faça login novamente.'
    });
  }

  req.user = users.get(email);

  next();
};

// Cadastro
app.post('/api/cadastro', (req, res) => {
  const usuario = String(
    req.body?.usuario || ''
  ).trim();

  const email = String(
    req.body?.email || ''
  ).trim().toLowerCase();

  const senha = String(
    req.body?.senha || ''
  );

  if (!usuario || !email || !senha) {
    return res.status(400).json({
      erro: 'Preencha todos os campos.'
    });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({
      erro: 'E-mail inválido.'
    });
  }

  if (senha.length < 6) {
    return res.status(400).json({
      erro: 'A senha precisa ter ao menos 6 caracteres.'
    });
  }

  if (users.has(email)) {
    return res.status(409).json({
      erro: 'Este e-mail já está cadastrado.'
    });
  }

  users.set(email, {
    usuario,
    ...hashSenha(senha)
  });

  return res.status(201).json({
    ok: true
  });
});

// Login
app.post('/api/login', (req, res) => {
  const email = String(
    req.body?.email || ''
  ).trim().toLowerCase();

  const senha = String(
    req.body?.senha || ''
  );

  const usuario = users.get(email);

  if (!usuario || !senhaOk(senha, usuario)) {
    return res.status(401).json({
      erro: 'E-mail ou senha incorretos.'
    });
  }

  const token = crypto.randomBytes(32).toString('hex');

  sessions.set(token, email);

  return res.json({
    token,
    usuario: usuario.usuario
  });
});

// Validar sessão
app.get('/api/me', auth, (req, res) => {
  return res.json({
    usuario: req.user.usuario
  });
});

// Encerrar sessão
app.post('/api/logout', auth, (req, res) => {
  const token = req.headers.authorization.slice(7);

  sessions.delete(token);

  return res.json({
    ok: true
  });
});

// Personalidades dos aliens
const ALIENS = {
  ben: 'Fale como Ben Tennyson, animado e brincalhão.',
  quatro: 'Você é o Quatro Braços: forte, direto e honrado.',
  xlr8: 'Você é o XLR8: veloz, energético e impaciente.',
  diamante: 'Você é o Diamante: calmo, firme e resistente.',
  chama: 'Você é o Chama: dramático, quente e brincalhão.',
  fantasmatico: 'Você é o Fantasmático: misterioso e brincalhão.'
};

// Chat com a Groq
app.post('/api/chat', auth, async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        erro: 'GROQ_API_KEY não configurada no arquivo .env.'
      });
    }

    const entrada = req.body?.messages;

    if (!Array.isArray(entrada)) {
      return res.status(400).json({
        erro: 'Formato de mensagens inválido.'
      });
    }

    const mensagens = entrada
      .filter(m =>
        m &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' &&
        m.content.trim()
      )
      .slice(-12)
      .map(m => ({
        role: m.role,
        content: m.content.slice(0, 1000)
      }));

    if (
      !mensagens.length ||
      mensagens[mensagens.length - 1].role !== 'user'
    ) {
      return res.status(400).json({
        erro: 'Envie uma mensagem válida.'
      });
    }

    const alien = ALIENS[req.body?.alien] || ALIENS.ben;

    const system = [
      `Você conversa com ${req.user.usuario} no universo Ben 10.`,
      alien,
      'Responda em português do Brasil.',
      'Use no máximo quatro frases curtas e divertidas.',
      'Fale sobre o Omnitrix, aliens, vilões e a série.',
      'Se o assunto fugir do tema, responda brevemente e retome Ben 10.'
    ].join(' ');

    const resposta = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          ...mensagens
        ],
        temperature: 0.8,
        max_completion_tokens: 2048
      }),
      signal: AbortSignal.timeout(30000)
    });

    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      console.error(
        'Erro da Groq:',
        resposta.status,
        dados?.error?.message || 'Resposta inválida da API'
      );

      return res.status(502).json({
        erro: 'A IA não conseguiu responder. Tente novamente.'
      });
    }

    const answer = dados?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      console.error('Resposta da Groq sem conteúdo.');

      return res.status(502).json({
        erro: 'A IA retornou uma resposta vazia.'
      });
    }

    return res.json({ answer });

  } catch (erro) {
    console.error('Erro em /api/chat:', erro);

    if (
      erro.name === 'TimeoutError' ||
      erro.name === 'AbortError'
    ) {
      return res.status(504).json({
        erro: 'A IA demorou demais para responder. Tente novamente.'
      });
    }

    return res.status(500).json({
      erro: 'Erro interno no servidor. Verifique o terminal.'
    });
  }
});

// Erros de JSON inválido e requisições
app.use((erro, req, res, next) => {
  if (res.headersSent) {
    return next(erro);
  }

  if (
    erro instanceof SyntaxError &&
    erro.status === 400 &&
    'body' in erro
  ) {
    return res.status(400).json({
      erro: 'JSON inválido na requisição.'
    });
  }

  console.error('Erro inesperado:', erro);

  return res.status(500).json({
    erro: 'Erro interno no servidor.'
  });
});

// Inicialização
app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Omnitrix online em http://localhost:${PORT}`
  );

  if (!process.env.GROQ_API_KEY) {
    console.warn(
      'Aviso: GROQ_API_KEY não foi configurada.'
    );
  }
});