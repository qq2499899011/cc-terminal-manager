#!/usr/bin/env node
// cc-hook.js — Claude Code hook 脚本
// 从 stdin 读取 CC 传入的 JSON，POST 到本地 hook-server
// 也支持 --uninstall-hooks 命令（NSIS 卸载时调用）

// 卸载模式：清理 ~/.claude/settings.json 中的 hook 条目
if (process.argv[2] === '--uninstall-hooks') {
  try {
    require('../src/shared/hook-cleanup').uninstall();
  } catch {
    // 打包为 exe 后路径不同，尝试相对路径
    try {
      const path = require('path');
      const cleanup = require(path.join(__dirname, '..', 'src', 'shared', 'hook-cleanup'));
      cleanup.uninstall();
    } catch {}
  }
  process.exit(0);
}

const http = require('http');

const PORT = parseInt(process.env.CC_MANAGER_HOOK_PORT || '7788', 10);
const eventType = process.argv[2] || 'unknown'; // 'stop' | 'notification'

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    payload = { raw: input };
  }

  const body = JSON.stringify({
    type: eventType,
    payload,
    timestamp: Date.now(),
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/hook-event',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 3000,
  }, (res) => {
    res.resume();
    process.exit(0);
  });

  req.on('error', () => process.exit(0)); // 静默失败，不阻塞 CC
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(body);
  req.end();
});
