const os = require('os');
const path = require('path');

// Claude Code 数据目录
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');
const SESSIONS_DIR = path.join(CLAUDE_HOME, 'sessions');
const CLAUDE_SETTINGS = path.join(CLAUDE_HOME, 'settings.json');

// 应用数据目录
const APP_DATA_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'cc-terminal-manager');
const META_FILE = path.join(APP_DATA_DIR, 'meta.json');
const SETTINGS_BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');

// Default hook server port; falls back to next free port
const DEFAULT_HOOK_PORT = 7800;

module.exports = {
  CLAUDE_HOME,
  PROJECTS_DIR,
  SESSIONS_DIR,
  CLAUDE_SETTINGS,
  APP_DATA_DIR,
  META_FILE,
  SETTINGS_BACKUP_DIR,
  DEFAULT_HOOK_PORT,
};
