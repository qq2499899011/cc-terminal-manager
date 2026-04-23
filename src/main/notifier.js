const { Notification } = require('electron');
const log = require('./logger');

let mainWindowRef = null;

function init(getMainWindow) {
  mainWindowRef = getMainWindow;
}

/**
 * 发送桌面通知 + 窗口闪烁
 * 注意：任务栏 overlay / 托盘徽标由 main/index.js 的 updateTrayBadge 统一管理，
 * 不在这里维护累积计数。
 */
function notify({ title, body, type, sessionId, onClick }) {
  try {
    const notif = new Notification({
      title: title || 'CC Terminal Manager',
      body: body || '',
      silent: type === 'stop',
    });

    notif.on('click', () => {
      const win = mainWindowRef?.();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        if (sessionId) {
          win.webContents.send('session:focus', sessionId);
        }
      }
      if (onClick) onClick();
    });

    notif.show();
  } catch (e) {
    log.error('[notifier] show failed:', e.message);
  }

  // 窗口失焦时闪烁任务栏，提醒用户
  const win = mainWindowRef?.();
  if (win && !win.isDestroyed() && !win.isFocused()) {
    win.flashFrame(true);
  }
}

/**
 * 窗口聚焦时调用：停止闪烁（overlay 角标不在这里清，由 badge 逻辑管）
 */
function clearFlash() {
  const win = mainWindowRef?.();
  if (win && !win.isDestroyed()) {
    win.flashFrame(false);
  }
}

module.exports = { init, notify, clearFlash };
