const fs = require('fs');
const path = require('path');
const { CLAUDE_SETTINGS, SETTINGS_BACKUP_DIR } = require('./paths');

const MARKER = '__cc_manager__';

/**
 * 注入 hooks 到 ~/.claude/settings.json
 * @param {string} hookScriptPath - cc-hook.js 的绝对路径
 * @param {number} port - hook server 端口
 */
function installHooks(hookScriptPath, port) {
  // 读取现有 settings
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  } catch {}

  // 备份
  backup(settings);

  // 构建 hook 命令
  const escapedPath = hookScriptPath.replace(/\\/g, '\\\\');
  const makeCmd = (eventType) =>
    `node "${escapedPath}" ${eventType}`;

  // 确保 hooks 对象存在
  if (!settings.hooks) settings.hooks = {};

  // 注入 Stop hook
  const stopHook = {
    matcher: '',
    hooks: [{ type: 'command', command: makeCmd('stop'), timeout: 5000, _marker: MARKER }],
  };

  // 注入 Notification hooks — 分别用 matcher 捕获两种审批场景
  const notifPermission = {
    matcher: 'permission_prompt',
    hooks: [{ type: 'command', command: makeCmd('notification'), timeout: 5000, _marker: MARKER }],
  };
  const notifElicitation = {
    matcher: 'elicitation_dialog',
    hooks: [{ type: 'command', command: makeCmd('notification'), timeout: 5000, _marker: MARKER }],
  };

  // 清理旧的 cc_manager hooks，保留用户自定义的
  settings.hooks.Stop = cleanAndAppend(settings.hooks.Stop, stopHook);
  settings.hooks.Notification = cleanAndAppend(
    cleanAndAppend(settings.hooks.Notification, notifPermission),
    notifElicitation
  );

  // 写入环境变量让 hook 脚本知道端口
  if (!settings.env) settings.env = {};
  settings.env.CC_MANAGER_HOOK_PORT = String(port);

  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2), 'utf8');
  return true;
}

/**
 * 卸载 hooks
 */
function uninstallHooks() {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  } catch { return false; }

  if (settings.hooks) {
    if (settings.hooks.Stop) {
      settings.hooks.Stop = removeMarked(settings.hooks.Stop);
      if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    }
    if (settings.hooks.Notification) {
      settings.hooks.Notification = removeMarked(settings.hooks.Notification);
      if (settings.hooks.Notification.length === 0) delete settings.hooks.Notification;
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  // 清理环境变量
  if (settings.env) {
    delete settings.env.CC_MANAGER_HOOK_PORT;
    if (Object.keys(settings.env).length === 0) delete settings.env;
  }

  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2), 'utf8');
  return true;
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
    console.error('Backup failed:', e.message);
  }
}

module.exports = { installHooks, uninstallHooks, isInstalled };
