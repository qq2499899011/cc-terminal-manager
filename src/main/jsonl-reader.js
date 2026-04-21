const fs = require('fs');
const path = require('path');
const { PROJECTS_DIR, SESSIONS_DIR } = require('./paths');

/**
 * 从 JSONL 文件头部提取 session 元信息（cwd + 首条用户消息）
 */
function peekSessionMeta(jsonlPath) {
  try {
    const fd = fs.openSync(jsonlPath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.slice(0, bytes).toString('utf8');
    const lines = content.split('\n').filter(Boolean);
    let cwd = null, title = null, sessionId = null;
    for (const line of lines.slice(0, 50)) {
      try {
        const ev = JSON.parse(line);
        if (!sessionId && ev.sessionId) sessionId = ev.sessionId;
        if (!cwd && ev.cwd) cwd = ev.cwd;
        if (!title && ev.type === 'user') {
          const c = ev.message?.content;
          if (typeof c === 'string' && c.trim() && !c.includes('<local-command')) {
            title = c.trim().slice(0, 80).replace(/\s+/g, ' ');
          }
        }
        if (cwd && title) break;
      } catch {}
    }
    return { cwd, title, sessionId };
  } catch {
    return {};
  }
}

/**
 * 扫描所有项目目录，返回 session 列表
 */
function listAllSessions() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());

  const sessions = [];
  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir.name);
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch { continue; }

    const files = entries.filter(f => f.isFile() && f.name.endsWith('.jsonl'));
    for (const f of files) {
      const full = path.join(dirPath, f.name);
      try {
        const stat = fs.statSync(full);
        const id = f.name.replace(/\.jsonl$/, '');
        const meta = peekSessionMeta(full);
        sessions.push({
          sessionId: id,
          cwd: normalizeCwd(meta.cwd) || null,
          title: meta.title || null,
          lastMtime: stat.mtimeMs,
          size: stat.size,
          projectDir: dir.name,
        });
      } catch {}
    }
  }

  return sessions.sort((a, b) => b.lastMtime - a.lastMtime);
}

/**
 * 规范化路径（Windows 大小写不敏感，统一为大写盘符）
 */
function normalizeCwd(cwd) {
  if (!cwd) return cwd;
  // 统一反斜杠，大写盘符
  let p = cwd.replace(/\//g, '\\');
  if (/^[a-z]:/.test(p)) {
    p = p[0].toUpperCase() + p.slice(1);
  }
  // 去掉末尾反斜杠
  if (p.length > 3 && p.endsWith('\\')) {
    p = p.slice(0, -1);
  }
  return p;
}

/**
 * 获取所有不重复的 cwd 列表
 */
function listCwds() {
  const sessions = listAllSessions();
  const normalized = sessions.map(s => normalizeCwd(s.cwd)).filter(Boolean);
  return [...new Set(normalized)];
}

/**
 * 全文搜索：在 JSONL 文件内容中搜索关键词
 * 每个文件最多读取 256KB，兼顾性能和覆盖率
 * @param {Array} sessions - listAllSessions() 的返回值
 * @param {string} query - 搜索关键词
 * @returns {string[]} - 匹配的 sessionId 列表
 */
function searchSessions(sessions, query) {
  if (!query) return sessions.map(s => s.sessionId);
  const q = query.toLowerCase();
  const matches = [];
  for (const s of sessions) {
    // 快速路径：元数据匹配
    if ((s.cwd || '').toLowerCase().includes(q) ||
        (s.title || '').toLowerCase().includes(q) ||
        (s.sessionId || '').toLowerCase().includes(q)) {
      matches.push(s.sessionId);
      continue;
    }
    // 慢路径：读取 JSONL 文件内容
    const jsonlPath = path.join(PROJECTS_DIR, s.projectDir, s.sessionId + '.jsonl');
    try {
      const fd = fs.openSync(jsonlPath, 'r');
      const buf = Buffer.alloc(256 * 1024);
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      if (buf.slice(0, bytes).toString('utf8').toLowerCase().includes(q)) {
        matches.push(s.sessionId);
      }
    } catch {}
  }
  return matches;
}

/**
 * 获取当前运行中的 Claude Code session（从 ~/.claude/sessions/ 读取）
 */
function listActiveSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const active = [];
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
        active.push({
          pid: data.pid,
          sessionId: data.sessionId,
          cwd: data.cwd,
          startedAt: data.startedAt,
          kind: data.kind,
        });
      } catch {}
    }
  } catch {}
  return active;
}

module.exports = { peekSessionMeta, listAllSessions, listCwds, listActiveSessions, searchSessions };
