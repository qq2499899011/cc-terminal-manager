const http = require('http');
const log = require('./logger');
const { DEFAULT_HOOK_PORT } = require('./paths');

let server = null;
let currentPort = DEFAULT_HOOK_PORT;
let eventHandler = null;

/**
 * 启动 hook server
 * @param {function} onEvent - 事件回调 ({ type, payload, timestamp })
 * @returns {Promise<number>} 实际监听的端口
 */
function start(onEvent) {
  eventHandler = onEvent;
  return new Promise((resolve, reject) => {
    tryListen(DEFAULT_HOOK_PORT, 3, resolve, reject);
  });
}

function tryListen(port, retries, resolve, reject) {
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/hook-event') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const event = JSON.parse(body);
          if (eventHandler) eventHandler(event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400);
          res.end('{"error":"bad json"}');
        }
      });
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      server.close();
      tryListen(port + 1, retries - 1, resolve, reject);
    } else {
      reject(err);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    currentPort = port;
    log.info('[hook-server] listening on 127.0.0.1:' + port);
    resolve(port);
  });
}

function stop() {
  if (server) {
    server.close();
    server = null;
  }
}

function getPort() {
  return currentPort;
}

module.exports = { start, stop, getPort };
