const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { listUsers, createUser, findUserByEmail, findUserById } = require('./store');

const port = Number(process.env.PORT || 3000);
const tokenSecret = process.env.JWT_SECRET || 'troque-esta-chave-em-producao';
const allowedRoles = ['ADMIN', 'GESTOR', 'MOTORISTA'];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON_INVALIDO');
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, originalHash] = storedPassword.split(':');
  const candidateHash = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidateHash, Buffer.from(originalHash, 'hex'));
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(user) {
  const payload = base64Url({
    sub: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
  });
  const signature = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function authenticate(request) {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return findUserById(decoded.sub);
  } catch {
    return null;
  }
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, { status: 'ok', service: 'sistema-frota-api', timestamp: new Date().toISOString() });
    }

    if (request.method === 'GET' && url.pathname === '/api') {
      return sendJson(response, 200, {
        name: 'Sistema de Frota API',
        version: '1.1.0',
        endpoints: ['/api/health', '/api/auth/register', '/api/auth/login', '/api/me', '/api/users']
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readJson(request);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const role = String(body.role || 'MOTORISTA').toUpperCase();

      if (name.length < 3 || !email.includes('@') || password.length < 8 || !allowedRoles.includes(role)) {
        return sendJson(response, 400, { error: 'Dados inválidos. Use nome, e-mail, senha com 8 caracteres e perfil válido.' });
      }
      if (findUserByEmail(email)) return sendJson(response, 409, { error: 'E-mail já cadastrado.' });

      const user = createUser({ name, email, passwordHash: hashPassword(password), role });
      return sendJson(response, 201, { user: publicUser(user), token: createToken(user) });
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = findUserByEmail(email);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(response, 401, { error: 'E-mail ou senha incorretos.' });
      }
      return sendJson(response, 200, { user: publicUser(user), token: createToken(user) });
    }

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const user = authenticate(request);
      if (!user) return sendJson(response, 401, { error: 'Token inválido ou expirado.' });
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === 'GET' && url.pathname === '/api/users') {
      const user = authenticate(request);
      if (!user) return sendJson(response, 401, { error: 'Autenticação necessária.' });
      if (!['ADMIN', 'GESTOR'].includes(user.role)) return sendJson(response, 403, { error: 'Permissão insuficiente.' });
      return sendJson(response, 200, { users: listUsers().map(publicUser) });
    }

    return sendJson(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    if (error.message === 'JSON_INVALIDO') return sendJson(response, 400, { error: 'Corpo JSON inválido.' });
    console.error(error);
    return sendJson(response, 500, { error: 'Erro interno do servidor.' });
  }
});

server.listen(port, () => {
  console.log(`Sistema de Frota API disponível em http://localhost:${port}`);
});
