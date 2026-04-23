// StatusCoordinator — 集中管理所有 session 的 FSM 实例
// 监听三个信号源：PTY 输入、Hook 事件、PTY 退出
// FSM 状态变更时统一推送 IPC、通知、角标

const SessionFSM = require('./session-fsm');
const { t } = require('../shared/i18n');
const {
  IDLE, THINKING, WAITING, PENDING_REVIEW, ERROR, OFFLINE,
  PTY_ENTER, PTY_ESC, HOOK_STOP, HOOK_NOTIFICATION, HOOK_STOP_FAILURE, PTY_EXIT, SESSION_VIEWED,
} = require('./fsm-events');

class StatusCoordinator {
  /**
   * @param {object} deps
   * @param {object} deps.ptyManager
   * @param {object} deps.notifier
   * @param {function} deps.getMainWindow - () => BrowserWindow | null
   * @param {function} deps.updateTrayBadge - () => void
   * @param {function} deps.shortenCwd - (cwd) => string
   */
  constructor(deps) {
    this._ptyManager = deps.ptyManager;
    this._notifier = deps.notifier;
    this._getMainWindow = deps.getMainWindow;
    this._updateTrayBadge = deps.updateTrayBadge;
    this._shortenCwd = deps.shortenCwd;
    this._fsms = new Map(); // internalId -> SessionFSM
    this._activeSessionId = null; // renderer 当前选中的 session
  }

  /**
   * 为新 session 创建 FSM
   */
  register(sessionId) {
    if (this._fsms.has(sessionId)) return;
    const fsm = new SessionFSM(sessionId, (id, newState, prevState) => {
      this._onStateChange(id, newState, prevState);
    });
    this._fsms.set(sessionId, fsm);
  }

  /**
   * 移除 session 的 FSM
   */
  unregister(sessionId) {
    const fsm = this._fsms.get(sessionId);
    if (fsm) {
      fsm.destroy();
      this._fsms.delete(sessionId);
    }
  }

  /**
   * PTY 输入拦截回调 — 由 pty-manager 调用
   */
  onPtyInput(sessionId, eventType) {
    const fsm = this._fsms.get(sessionId);
    if (fsm) fsm.dispatch(eventType);
  }

  /**
   * Hook 事件处理 — 由 index.js 转发
   */
  onHookEvent(event) {
    const { type, payload } = event;
    const sessionId = payload?.session_id;
    const cwd = payload?.cwd;

    // 尝试绑定 claude session id
    if (sessionId) {
      const sessions = this._ptyManager.list();
      for (const s of sessions) {
        if (s.cwd === cwd && !s.claudeSessionId) {
          this._ptyManager.bindClaudeId(s.internalId, sessionId);
          this._sendToRenderer('session:bind-claude-id', s.internalId, sessionId);
          break;
        }
      }
    }

    // 找到匹配的内部 session
    const match = this._findSession(sessionId, cwd);
    if (!match) return;

    // 映射 hook type 到 FSM 事件
    if (type === 'notification') {
      this._dispatchFSM(match.internalId, HOOK_NOTIFICATION);
    } else if (type === 'stop') {
      this._dispatchFSM(match.internalId, HOOK_STOP);
      // HOOK_STOP → PENDING_REVIEW；如果用户正在看这个 session，立即确认
      this._tryAutoView(match.internalId);
    } else if (type === 'stop_failure') {
      this._dispatchFSM(match.internalId, HOOK_STOP_FAILURE);
    }
  }

  /**
   * PTY 退出事件
   */
  onPtyExit(sessionId) {
    this._dispatchFSM(sessionId, PTY_EXIT);
  }

  /**
   * renderer 通知当前选中的 session 变更
   */
  onSessionActivated(sessionId) {
    this._activeSessionId = sessionId;
    // 如果该 session 处于 PENDING_REVIEW 且窗口聚焦，立即确认
    this._tryAutoView(sessionId);
  }

  /**
   * 窗口获得焦点时，检查当前 active session 是否需要确认
   */
  onWindowFocused() {
    if (this._activeSessionId) {
      this._tryAutoView(this._activeSessionId);
    }
  }

  /**
   * 检查 session 是否满足"已被查看"条件：窗口聚焦 + 该 session 是 active
   */
  _tryAutoView(sessionId) {
    const fsm = this._fsms.get(sessionId);
    if (!fsm || fsm.getState() !== PENDING_REVIEW) return;
    if (sessionId !== this._activeSessionId) return;
    const win = this._getMainWindow();
    if (!win || win.isDestroyed() || !win.isFocused()) return;
    fsm.dispatch(SESSION_VIEWED);
  }

  /**
   * 屏幕解析兜底校正（renderer 上报）
   */
  onScreenCorrection(sessionId, suggestedStatus) {
    const fsm = this._fsms.get(sessionId);
    if (!fsm) return;
    const stateMap = {
      'running': IDLE,
      'thinking': THINKING,
      'needs_approval': WAITING,
    };
    const mapped = stateMap[suggestedStatus];
    if (!mapped) return;

    const cur = fsm.getState();

    // 屏幕显示空闲但 FSM 在 THINKING/WAITING → CC 已完成，
    // 走正式 HOOK_STOP 路径（→ PENDING_REVIEW）而非直接跳 IDLE。
    // 延迟 8s 给真正的 Hook 事件留出时间先到达。
    if ((cur === THINKING || cur === WAITING) && mapped === IDLE) {
      if (fsm.getElapsed() >= 8000) {
        fsm.dispatch(HOOK_STOP);
        this._tryAutoView(sessionId);
      }
      return;
    }

    fsm.correctIfStale(mapped);
  }

  // ---- 内部方法 ----

  _dispatchFSM(sessionId, event) {
    const fsm = this._fsms.get(sessionId);
    if (fsm) fsm.dispatch(event);
  }

  _findSession(claudeSessionId, cwd) {
    const sessions = this._ptyManager.list();
    return sessions.find(s =>
      s.claudeSessionId === claudeSessionId || s.cwd === cwd
    ) || null;
  }

  /**
   * FSM 状态变更回调 — 统一处理所有副作用
   */
  _onStateChange(sessionId, newState, prevState) {
    // 映射 FSM 状态到现有 pty-manager status 名
    const statusMap = {
      [IDLE]: 'running',
      [THINKING]: 'thinking',
      [WAITING]: 'needs_approval',
      [PENDING_REVIEW]: 'pending_review',
      [ERROR]: 'error',
      [OFFLINE]: 'exited',
    };
    const status = statusMap[newState] || 'running';

    // 更新 pty-manager 中的状态
    this._ptyManager.updateStatus(sessionId, status);

    // IPC 通知 renderer
    this._sendToRenderer('session:status-change', sessionId, status);

    // 系统通知
    this._maybeNotify(sessionId, newState, prevState);

    // 刷新托盘角标
    this._updateTrayBadge();
  }

  _maybeNotify(sessionId, newState, prevState) {
    const s = this._ptyManager.get(sessionId);
    const label = s?.name || this._shortenCwd(s?.cwd);

    if (newState === WAITING && prevState !== WAITING) {
      this._notifier.notify({
        title: t('notif_approval_title'),
        body: t('notif_approval_body', label),
        type: 'needs_input',
        sessionId,
      });
    } else if (newState === PENDING_REVIEW) {
      this._notifier.notify({
        title: t('notif_stop_title'),
        body: t('notif_stop_body', label),
        type: 'stop',
        sessionId,
      });
    } else if (newState === ERROR) {
      this._notifier.notify({
        title: t('notif_error_title'),
        body: t('notif_error_body', label),
        type: 'error',
        sessionId,
      });
    } else if (newState === OFFLINE) {
      this._notifier.notify({
        title: t('notif_offline_title'),
        body: t('notif_offline_body', label),
        type: 'exit',
        sessionId,
      });
    }
  }

  _sendToRenderer(...args) {
    const win = this._getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(...args);
    }
  }
}

module.exports = StatusCoordinator;
