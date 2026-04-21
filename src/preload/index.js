const { contextBridge, ipcRenderer } = require('electron');

// IPC 通道常量（内联，避免沙箱 require 路径问题）
const SESSION_CREATE = 'session:create';
const SESSION_KILL = 'session:kill';
const SESSION_RENAME = 'session:rename';
const SESSION_LIST = 'session:list';
const PTY_INPUT = 'pty:input';
const PTY_RESIZE = 'pty:resize';
const PTY_DATA = 'pty:data';
const PTY_EXIT = 'pty:exit';
const HISTORY_LIST = 'history:list';
const CWD_HISTORY = 'cwd:history';
const SETTINGS_GET = 'settings:get';
const SETTINGS_SET = 'settings:set';
const HOOKS_ENABLE = 'hooks:enable';
const HOOKS_DISABLE = 'hooks:disable';
const OPEN_DIRECTORY_DIALOG = 'dialog:open-directory';
const SESSION_STATUS_CHANGE = 'session:status-change';
const SESSION_BIND_CLAUDE_ID = 'session:bind-claude-id';
const SESSION_REPORT_STATUS = 'session:report-status';
const SESSION_ACTIVATED = 'session:activated';
const HISTORY_SEARCH = 'history:search';
const SESSION_FOCUS = 'session:focus';
const SESSION_AUTO_NAME = 'session:auto-name';

contextBridge.exposeInMainWorld('ccAPI', {
  // Session management
  createSession: (opts) => ipcRenderer.invoke(SESSION_CREATE, opts),
  killSession: (id) => ipcRenderer.invoke(SESSION_KILL, id),
  renameSession: (id, name) => ipcRenderer.invoke(SESSION_RENAME, id, name),
  listSessions: () => ipcRenderer.invoke(SESSION_LIST),

  // PTY I/O
  ptyInput: (sessionId, data) => ipcRenderer.send(PTY_INPUT, sessionId, data),
  ptyResize: (sessionId, cols, rows) => ipcRenderer.send(PTY_RESIZE, sessionId, cols, rows),
  onPtyData: (cb) => {
    const handler = (_e, sessionId, data) => cb(sessionId, data);
    ipcRenderer.on(PTY_DATA, handler);
    return () => ipcRenderer.removeListener(PTY_DATA, handler);
  },
  onPtyExit: (cb) => {
    const handler = (_e, sessionId, code) => cb(sessionId, code);
    ipcRenderer.on(PTY_EXIT, handler);
    return () => ipcRenderer.removeListener(PTY_EXIT, handler);
  },

  // History
  listHistory: () => ipcRenderer.invoke(HISTORY_LIST),
  getCwdHistory: () => ipcRenderer.invoke(CWD_HISTORY),

  // Settings
  getSettings: () => ipcRenderer.invoke(SETTINGS_GET),
  setSettings: (settings) => ipcRenderer.invoke(SETTINGS_SET, settings),

  // Hooks
  enableHooks: () => ipcRenderer.invoke(HOOKS_ENABLE),
  disableHooks: () => ipcRenderer.invoke(HOOKS_DISABLE),

  // Dialog
  openDirectoryDialog: () => ipcRenderer.invoke(OPEN_DIRECTORY_DIALOG),

  // Renderer → Main: 上报本地 PTY 检测到的 session 状态
  reportStatusChange: (sessionId, status) => ipcRenderer.send(SESSION_REPORT_STATUS, sessionId, status),

  // Renderer → Main: 通知当前激活的 session 变更
  reportSessionActivated: (sessionId) => ipcRenderer.send(SESSION_ACTIVATED, sessionId),

  // Events from main
  onSessionStatusChange: (cb) => {
    const handler = (_e, sessionId, status) => cb(sessionId, status);
    ipcRenderer.on(SESSION_STATUS_CHANGE, handler);
    return () => ipcRenderer.removeListener(SESSION_STATUS_CHANGE, handler);
  },
  onSessionBindClaudeId: (cb) => {
    const handler = (_e, internalId, claudeSessionId) => cb(internalId, claudeSessionId);
    ipcRenderer.on(SESSION_BIND_CLAUDE_ID, handler);
    return () => ipcRenderer.removeListener(SESSION_BIND_CLAUDE_ID, handler);
  },

  // 通知点击定位到对应 session
  onSessionFocus: (cb) => {
    const handler = (_e, sessionId) => cb(sessionId);
    ipcRenderer.on(SESSION_FOCUS, handler);
    return () => ipcRenderer.removeListener(SESSION_FOCUS, handler);
  },

  // 自动命名推送
  onSessionAutoName: (cb) => {
    const handler = (_e, sessionId, name) => cb(sessionId, name);
    ipcRenderer.on(SESSION_AUTO_NAME, handler);
    return () => ipcRenderer.removeListener(SESSION_AUTO_NAME, handler);
  },

  // 全文搜索历史
  searchHistory: (query) => ipcRenderer.invoke(HISTORY_SEARCH, query),
});
