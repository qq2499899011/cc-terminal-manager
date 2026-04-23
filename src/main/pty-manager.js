const pty = require('node-pty');
const { randomUUID } = require('crypto');
const os = require('os');
const log = require('./logger');

// session 存储
const sessions = new Map();

// 输入拦截回调 — 由 status-coordinator 注册
let inputEventCallback = null;

function setInputEventCallback(cb) {
  inputEventCallback = cb;
}

// 默认 shell — Claude Code 需要 git-bash
function getDefaultShell() {
  if (os.platform() === 'win32') {
    if (process.env.CLAUDE_CODE_GIT_BASH_PATH) return process.env.CLAUDE_CODE_GIT_BASH_PATH;
    const fs = require('fs');
    const candidates = [
      'D:\\Software\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

/**
 * 创建新 session
 * @param {object} opts
 * @param {string} opts.cwd - 工作目录
 * @param {string} [opts.resumeId] - 恢复的 claude session id
 * @param {string} [opts.shell] - 指定 shell（默认 pwsh/cmd）
 * @param {string} [opts.mode] - 启动模式：default / yolo / plan
 * @param {function} opts.onData - PTY 数据回调 (sessionId, data)
 * @param {function} opts.onExit - PTY 退出回调 (sessionId, exitCode)
 * @returns {{ internalId: string, ptyPid: number }}
 */
function createSession({ cwd, resumeId, shell, mode, onData, onExit }) {
  const internalId = randomUUID();
  const shellPath = shell || getDefaultShell();
  const sessionCwd = cwd || process.cwd();

  log.info('[pty] creating session', { shellPath, sessionCwd, resumeId, mode });

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: sessionCwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
  } catch (e) {
    log.error('[pty] spawn failed:', e.message, { shellPath, sessionCwd });
    throw e;
  }

  const session = {
    internalId,
    ptyProcess,
    ptyPid: ptyProcess.pid,
    cwd: sessionCwd,
    claudeSessionId: resumeId || null,  // 恢复时直接预填，不等 hook 事件
    createdAt: Date.now(),
    name: null,
    status: 'running',
  };

  sessions.set(internalId, session);

  // 数据转发
  ptyProcess.onData((data) => {
    if (onData) onData(internalId, data);
  });

  // 退出处理
  ptyProcess.onExit(({ exitCode }) => {
    session.status = 'exited';
    if (onExit) onExit(internalId, exitCode);
  });

  // 延迟注入 claude 命令（直接写 ptyProcess，不经过 writeInput，不触发自动命名）
  setTimeout(() => {
    let cmd = 'claude';
    if (resumeId) {
      cmd += ` --resume ${resumeId}`;
    } else {
      switch (mode) {
        case 'yolo':
          cmd += ' --dangerously-skip-permissions';
          break;
        case 'plan':
          cmd += ' --plan';
          break;
        // 'default' = no extra flags
      }
    }
    ptyProcess.write(cmd + '\r');
  }, 300);

  return { internalId, ptyPid: ptyProcess.pid };
}

/**
 * 向 session 写入输入
 */
function writeInput(sessionId, data) {
  const s = sessions.get(sessionId);
  if (s && s.status !== 'exited') {
    // 输入拦截：检测 Enter / Esc
    if (inputEventCallback) {
      if (data.includes('\r') || data.includes('\n')) {
        inputEventCallback(sessionId, 'PTY_ENTER');
      } else if (data === '\x1b') {
        // 单独的 Esc 键
        inputEventCallback(sessionId, 'PTY_ESC');
      }
    }
    s.ptyProcess.write(data);
  }
}

/**
 * 调整终端大小
 */
function resize(sessionId, cols, rows) {
  const s = sessions.get(sessionId);
  if (s && s.status !== 'exited') {
    s.ptyProcess.resize(cols, rows);
  }
}

/**
 * 终止 session
 */
function kill(sessionId) {
  const s = sessions.get(sessionId);
  if (s && s.status !== 'exited') {
    s.ptyProcess.kill();
    s.status = 'exited';
  }
}

/**
 * 移除 session 记录
 */
function remove(sessionId) {
  kill(sessionId);
  sessions.delete(sessionId);
}

/**
 * 列出所有 session
 */
function list() {
  return Array.from(sessions.values()).map(s => ({
    internalId: s.internalId,
    ptyPid: s.ptyPid,
    cwd: s.cwd,
    claudeSessionId: s.claudeSessionId,
    createdAt: s.createdAt,
    name: s.name,
    status: s.status,
  }));
}

/**
 * 获取 session
 */
function get(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * 绑定 claude session id
 */
function bindClaudeId(internalId, claudeSessionId) {
  const s = sessions.get(internalId);
  if (s) s.claudeSessionId = claudeSessionId;
}

/**
 * 更新 session 状态
 */
function updateStatus(internalId, status) {
  const s = sessions.get(internalId);
  if (s) s.status = status;
}

/**
 * 重命名 session
 */
function rename(internalId, name) {
  const s = sessions.get(internalId);
  if (s) s.name = name;
}

/**
 * 销毁所有 session（应用退出时调用）
 */
function destroyAll() {
  for (const s of sessions.values()) {
    if (s.status !== 'exited') {
      try { s.ptyProcess.kill(); } catch {}
    }
  }
  sessions.clear();
}

module.exports = {
  createSession, writeInput, resize, kill, remove,
  list, get, bindClaudeId, updateStatus, rename, destroyAll,
  setInputEventCallback,
};
