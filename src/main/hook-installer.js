const fs = require('fs');
const path = require('path');
const log = require('./logger');
const { CLAUDE_SETTINGS, SETTINGS_BACKUP_DIR } = require('./paths');
const { uninstall: sharedUninstall } = require('../shared/hook-cleanup');

const MARKER = '__cc_manager__';

/**
 * 获取 hook exe 路径（打包后用 exe，开发时用 node + js）
 */
function getHookExePath() {
  const { app } = require('electron');
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'hook-bin', 'cc-hook.exe');
  }
  return path.join(__dirname, '..', '..', 'dist-hook', 'cc-hook.exe');
}

/**
 * 判断 hook exe 是否存在，不存在则 fallback 到 node + js
 */
function makeHookCommand(eventType) {
  const exePath = getHookExePath();
  if (fs.existsSync(exePath)) {
    return `"${exePath}" ${eventType}`;
  }
  // dev fallback: 使用 node 运行源文件
  const jsPath = path.join(__dirname, '..', '..', 'hook-scripts', 'cc-hook.js');
  return `node "${jsPath}" ${eventType}`;
}

/**
 * 注入 hooks 到 ~/.claude/settings.json
 * @param {string} _hookScriptPath - 已废弃，保留参数兼容
 * @param {number} port - hook server 端口
 */
function installHooks(_hookScriptPath, port) {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  } catch {}

  backup(settings);

  if (!settings.hooks) settings.hooks = {};

  const stopHook = {
    matcher: '',
    hooks: [{ type: 'command', command: makeHookCommand('stop'), timeout: 5000, _marker: MARKER }],
  };

  const notifPermission = {
    matcher: 'permission_prompt',
    hooks: [{ type: 'command', command: makeHookCommand('notification'), timeout: 5000, _marker: MARKER }],
  };
  const notifElicitation = {
    matcher: 'elicitation_dialog',
    hooks: [{ type: 'command', command: makeHookCommand('notification'), timeout: 5000, _marker: MARKER }],
  };

  settings.hooks.Stop = cleanAndAppend(settings.hooks.Stop, stopHook);
  settings.hooks.Notification = cleanAndAppend(
    cleanAndAppend(settings.hooks.Notification, notifPermission),
    notifElicitation
  );

  if (!settings.env) settings.env = {};
  settings.env.CC_MANAGER_HOOK_PORT = String(port);

  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2), 'utf8');
  return true;
}

/**
 * 卸载 hooks — 委托给 shared/hook-cleanup
 */
function uninstallHooks() {
  return sharedUninstall();
}

/**
 * 检查 hooks 是否已安装
 */
function isInstalled() {
  try {
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
    const stopHooks = settings.hooks?.Stop || [];
    return stopHooks.some(entry =>
      entry.hooks?.some(h => h._marker === MARKER)
    );
  } catch {
    return false;
  }
}

// ---- 内部工具 ----

function cleanAndAppend(existing, newEntry) {
  const cleaned = removeMarked(existing || []);
  cleaned.push(newEntry);
  return cleaned;
}

function removeMarked(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => {
    if (!entry.hooks) return true;
    // 移除包含 marker 的 hook
    entry.hooks = entry.hooks.filter(h => h._marker !== MARKER);
    return entry.hooks.length > 0;
  });
}

function backup(settings) {
  try {
    fs.mkdirSync(SETTINGS_BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(SETTINGS_BACKUP_DIR, `claude-settings.backup.${ts}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(settings, null, 2), 'utf8');

    // 只保留最近 10 个备份
    const files = fs.readdirSync(SETTINGS_BACKUP_DIR)
      .filter(f => f.startsWith('claude-settings.backup.'))
      .sort()
      .reverse();
    for (const f of files.slice(10)) {
      fs.unlinkSync(path.join(SETTINGS_BACKUP_DIR, f));
    }
  } catch (e) {
    log.error('[hook-installer] backup failed:', e.message);
  }
}

module.exports = { installHooks, uninstallHooks, isInstalled };
