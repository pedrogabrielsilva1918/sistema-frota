const http = require('node:http');

const port = Number(process.env.PORT || 3000);

const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Access-Control-Allow-Origin', '*');

  if (request.method === 'GET' && request.url === '/api/health') {
    response.writeHead(200);
    response.end(JSON.stringify({
      status: 'ok',
      service: 'sistema-frota-api',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (request.method === 'GET' && request.url === '/api') {
    response.writeHead(200);
    response.end(JSON.stringify({
      name: 'Sistema de Frota API',
      version: '1.0.0',
      endpoints: ['/api/health']
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: 'Rota não encontrada' }));
});

server.listen(port, () => {
  console.log(`Sistema de Frota API disponível em http://localhost:${port}`);
});
