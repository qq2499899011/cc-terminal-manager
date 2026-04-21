const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ptyManager = require('./pty-manager');
const jsonlReader = require('./jsonl-reader');
const hookServer = require('./hook-server');
const hookInstaller = require('./hook-installer');
const notifier = require('./notifier');
const sessionStore = require('./session-store');
const badgeIcons = require('./badge-icons');
const StatusCoordinator = require('./status-coordinator');
const {
  SESSION_CREATE, SESSION_KILL, SESSION_RENAME, SESSION_LIST,
  PTY_INPUT, PTY_RESIZE, PTY_DATA, PTY_EXIT,
  HISTORY_LIST, CWD_HISTORY, SETTINGS_GET, SETTINGS_SET,
  HOOKS_ENABLE, HOOKS_DISABLE, OPEN_DIRECTORY_DIALOG,
  SESSION_STATUS_CHANGE, SESSION_BIND_CLAUDE_ID,
  SESSION_REPORT_STATUS, SESSION_ACTIVATED,
  HISTORY_SEARCH, SESSION_FOCUS, SESSION_AUTO_NAME,
} = require('../shared/ipc-channels.cjs');

let mainWindow = null;
let tray = null;
let coordinator = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e2e',
      symbolColor: '#cdd6f4',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1e1e2e',
    show: false,
  });

  // 优先加载 Vite 构建产物，fallback 到源文件
  const distIndex = path.join(__dirname, '..', '..', 'dist-renderer', 'index.html');
  const srcIndex = path.join(__dirname, '..', 'renderer', 'index.html');
  mainWindow.loadFile(fs.existsSync(distIndex) ? distIndex : srcIndex);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 窗口获得焦点时清除闪烁 + 通知 coordinator 检查 pending_review
  mainWindow.on('focus', () => {
    notifier.clearFlash();
    if (coordinator) coordinator.onWindowFocused();
  });

  // Open devtools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// ---- Hook 事件处理 —— 委托给 StatusCoordinator ----
function handleHookEvent(event) {
  if (coordinator) {
    coordinator.onHookEvent(event);
  }
}

function shortenCwd(cwd) {
  if (!cwd) return '';
  const parts = cwd.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : cwd;
}

// ---- IPC: PTY ----
ipcMain.handle(SESSION_CREATE, (_e, opts) => {
  // 记录 cwd 历史
  if (opts.cwd) sessionStore.addCwdHistory(opts.cwd);

  const result = ptyManager.createSession({
    cwd: opts.cwd,
    resumeId: opts.resumeId,
    shell: opts.shell,
    mode: opts.mode,
    onData: (sessionId, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PTY_DATA, sessionId, data);
      }
    },
    onExit: (sessionId, exitCode) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PTY_EXIT, sessionId, exitCode);
      }
      // 通知 coordinator PTY 退出
      if (coordinator) coordinator.onPtyExit(sessionId);
    },
  });

  // 注册 FSM
  if (coordinator) coordinator.register(result.internalId);

  updateTrayBadge();
  return result;
});

ipcMain.handle(SESSION_KILL, (_e, sessionId) => {
  if (coordinator) coordinator.unregister(sessionId);
  ptyManager.kill(sessionId);
  ptyManager.remove(sessionId);
  updateTrayBadge();
});

ipcMain.handle(SESSION_RENAME, (_e, sessionId, name) => {
  ptyManager.rename(sessionId, name);
  // 如果有绑定的 claude session id，也持久化名字
  const s = ptyManager.get(sessionId);
  if (s?.claudeSessionId) {
    sessionStore.setSessionName(s.claudeSessionId, name);
  }
});

ipcMain.handle(SESSION_LIST, () => {
  return ptyManager.list();
});

ipcMain.on(PTY_INPUT, (_e, sessionId, data) => {
  ptyManager.writeInput(sessionId, data);
});

ipcMain.on(PTY_RESIZE, (_e, sessionId, cols, rows) => {
  ptyManager.resize(sessionId, cols, rows);
});

// renderer 上报本地 PTY 检测的状态变化 —— 作为兜底校正信号传给 coordinator
ipcMain.on(SESSION_REPORT_STATUS, (_e, sessionId, status) => {
  if (coordinator) {
    coordinator.onScreenCorrection(sessionId, status);
  }
});

// renderer 通知当前激活的 session 变更
ipcMain.on(SESSION_ACTIVATED, (_e, sessionId) => {
  if (coordinator) {
    coordinator.onSessionActivated(sessionId);
  }
});

// IPC: History / CWD
ipcMain.handle(HISTORY_LIST, () => {
  const sessions = jsonlReader.listAllSessions();
  // B5: 合并 session-store 中的自定义名称
  const meta = sessionStore.load();
  for (const s of sessions) {
    const stored = meta.sessionMeta[s.sessionId];
    if (stored?.name) {
      s.customName = stored.name;
    }
  }
  return sessions;
});

// IPC: 全文搜索历史
ipcMain.handle(HISTORY_SEARCH, (_e, query) => {
  const sessions = jsonlReader.listAllSessions();
  return jsonlReader.searchSessions(sessions, query);
});

ipcMain.handle(CWD_HISTORY, () => {
  // 合并 JSONL 中的 cwd 和用户历史
  const jsonlCwds = jsonlReader.listCwds();
  const storeCwds = sessionStore.getCwdHistory();
  return [...new Set([...storeCwds, ...jsonlCwds])];
});

// IPC: Settings
ipcMain.handle(SETTINGS_GET, () => {
  return sessionStore.getSettings();
});

ipcMain.handle(SETTINGS_SET, (_e, partial) => {
  return sessionStore.setSettings(partial);
});

// IPC: Hooks
ipcMain.handle(HOOKS_ENABLE, async () => {
  const hookScriptPath = path.join(__dirname, '..', '..', 'hook-scripts', 'cc-hook.js');
  const port = hookServer.getPort();
  return hookInstaller.installHooks(hookScriptPath, port);
});

ipcMain.handle(HOOKS_DISABLE, () => {
  return hookInstaller.uninstallHooks();
});

// IPC: open directory dialog
ipcMain.handle(OPEN_DIRECTORY_DIALOG, async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ---- App lifecycle ----
app.whenReady().then(async () => {
  notifier.init(() => mainWindow);
  createWindow();
  createTray();

  // 初始化 StatusCoordinator
  coordinator = new StatusCoordinator({
    ptyManager,
    notifier,
    getMainWindow: () => mainWindow,
    updateTrayBadge,
    shortenCwd,
  });

  // 注册 PTY 输入拦截回调
  ptyManager.setInputEventCallback((sessionId, eventType) => {
    coordinator.onPtyInput(sessionId, eventType);
  });

  // 启动 hook server
  try {
    const port = await hookServer.start(handleHookEvent);
    console.log(`Hook server started on port ${port}`);

    // 自动安装 hooks（如果设置允许）
    const settings = sessionStore.getSettings();
    if (settings.hooksEnabled) {
      const hookScriptPath = path.join(__dirname, '..', '..', 'hook-scripts', 'cc-hook.js');
      hookInstaller.installHooks(hookScriptPath, port);
    } else {
      // 清理可能残留的旧 hooks（历史安装）
      try { hookInstaller.uninstallHooks(); } catch {}
    }
  } catch (e) {
    console.error('Failed to start hook server:', e.message);
  }
});

app.on('window-all-closed', () => {
  // 卸载 hooks
  try { hookInstaller.uninstallHooks(); } catch {}
  hookServer.stop();
  ptyManager.destroyAll();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ---- 托盘图标 + 任务栏 overlay 角标 ----
function createTray() {
  const icon = badgeIcons.createTrayIcon(0);
  tray = new Tray(icon);
  tray.setToolTip('CC Terminal Manager');

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  updateTrayBadge();
}

/**
 * 统计角标数字：绿色闪烁(pending_review) + 黄色闪烁(needs_approval)
 */
function countPendingSessions() {
  const sessions = ptyManager.list();
  return sessions.filter(s =>
    s.status === 'needs_approval' ||
    s.status === 'pending_review'
  ).length;
}

/**
 * 单独统计需要审批的 session —— 用于 tooltip 区分
 */
function countNeedsApproval() {
  const sessions = ptyManager.list();
  return sessions.filter(s =>
    s.status === 'needs_approval' || s.status === 'waiting_input'
  ).length;
}

function updateTrayBadge() {
  const count = countPendingSessions();
  const approvalCount = countNeedsApproval();

  // 托盘图标
  if (tray && !tray.isDestroyed()) {
    tray.setImage(badgeIcons.createTrayIcon(count));
    const tip = count > 0
      ? (approvalCount > 0
          ? `CC Terminal Manager - ${approvalCount} 个待审批 / ${count} 个待处理`
          : `CC Terminal Manager - ${count} 个待处理`)
      : 'CC Terminal Manager';
    tray.setToolTip(tip);
  }

  // 任务栏 overlay（窗口图标右下角的数字徽标）
  if (mainWindow && !mainWindow.isDestroyed()) {
    const overlay = badgeIcons.createOverlayIcon(count);
    try {
      if (overlay) {
        mainWindow.setOverlayIcon(overlay, `${count} 个待处理`);
      } else {
        mainWindow.setOverlayIcon(null, '');
      }
    } catch {}
  }
}

module.exports = { getMainWindow: () => mainWindow, updateTrayBadge };
