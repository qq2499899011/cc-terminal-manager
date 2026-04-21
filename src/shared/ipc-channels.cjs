// IPC 通道名常量（CJS 版本，供 main/preload 使用）

// 渲染 → 主
const SESSION_CREATE = 'session:create';
const SESSION_KILL = 'session:kill';
const SESSION_RENAME = 'session:rename';
const SESSION_LIST = 'session:list';
const PTY_INPUT = 'pty:input';
const PTY_RESIZE = 'pty:resize';
const HISTORY_LIST = 'history:list';
const CWD_HISTORY = 'cwd:history';
const SETTINGS_GET = 'settings:get';
const SETTINGS_SET = 'settings:set';
const HOOKS_ENABLE = 'hooks:enable';
const HOOKS_DISABLE = 'hooks:disable';
const OPEN_DIRECTORY_DIALOG = 'dialog:open-directory';
const SESSION_REPORT_STATUS = 'session:report-status';
const SESSION_ACTIVATED = 'session:activated';

// 主 → 渲染
const PTY_DATA = 'pty:data';
const PTY_EXIT = 'pty:exit';
const SESSION_STATUS_CHANGE = 'session:status-change';
const SESSION_BIND_CLAUDE_ID = 'session:bind-claude-id';

module.exports = {
  SESSION_CREATE, SESSION_KILL, SESSION_RENAME, SESSION_LIST,
  PTY_INPUT, PTY_RESIZE, PTY_DATA, PTY_EXIT,
  HISTORY_LIST, CWD_HISTORY, SETTINGS_GET, SETTINGS_SET,
  HOOKS_ENABLE, HOOKS_DISABLE, OPEN_DIRECTORY_DIALOG,
  SESSION_STATUS_CHANGE, SESSION_BIND_CLAUDE_ID,
  SESSION_REPORT_STATUS, SESSION_ACTIVATED,
};
