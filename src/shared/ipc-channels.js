// IPC 通道名常量（主进程 / 渲染进程共用）

// 渲染 → 主
export const SESSION_CREATE = 'session:create';
export const SESSION_KILL = 'session:kill';
export const SESSION_RENAME = 'session:rename';
export const SESSION_LIST = 'session:list';
export const PTY_INPUT = 'pty:input';
export const PTY_RESIZE = 'pty:resize';
export const HISTORY_LIST = 'history:list';
export const CWD_HISTORY = 'cwd:history';
export const SETTINGS_GET = 'settings:get';
export const SETTINGS_SET = 'settings:set';
export const HOOKS_ENABLE = 'hooks:enable';
export const HOOKS_DISABLE = 'hooks:disable';
export const OPEN_DIRECTORY_DIALOG = 'dialog:open-directory';
export const SESSION_REPORT_STATUS = 'session:report-status';
export const SESSION_ACTIVATED = 'session:activated';
export const HISTORY_SEARCH = 'history:search';

// 主 → 渲染
export const PTY_DATA = 'pty:data';
export const PTY_EXIT = 'pty:exit';
export const SESSION_STATUS_CHANGE = 'session:status-change';
export const SESSION_BIND_CLAUDE_ID = 'session:bind-claude-id';
export const SESSION_FOCUS = 'session:focus';
export const SESSION_AUTO_NAME = 'session:auto-name';
