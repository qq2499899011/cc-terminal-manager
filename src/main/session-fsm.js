// SessionFSM — 每个 session 一个实例的有限状态机
// 纯逻辑，无 IPC / DOM 依赖

const {
  IDLE, THINKING, WAITING, PENDING_REVIEW, ERROR, OFFLINE,
  PTY_ENTER, PTY_ESC, HOOK_STOP, HOOK_NOTIFICATION, HOOK_STOP_FAILURE, PTY_EXIT, SESSION_VIEWED,
} = require('./fsm-events');

// 状态转换表：transitions[currentState][event] = nextState
const TRANSITIONS = {
  [IDLE]: {
    [PTY_ENTER]: THINKING,
    [PTY_EXIT]: OFFLINE,
    [HOOK_STOP_FAILURE]: ERROR,
  },
  [THINKING]: {
    [HOOK_NOTIFICATION]: WAITING,
    [HOOK_STOP]: PENDING_REVIEW,
    [PTY_ESC]: IDLE,
    [PTY_EXIT]: OFFLINE,
    [HOOK_STOP_FAILURE]: ERROR,
  },
  [WAITING]: {
    [PTY_ENTER]: THINKING,
    [HOOK_STOP]: PENDING_REVIEW,
    [PTY_ESC]: IDLE,
    [PTY_EXIT]: OFFLINE,
    [HOOK_STOP_FAILURE]: ERROR,
  },
  [PENDING_REVIEW]: {
    [SESSION_VIEWED]: IDLE,
    [PTY_ENTER]: THINKING,
    [PTY_EXIT]: OFFLINE,
    [HOOK_STOP_FAILURE]: ERROR,
  },
  [ERROR]: {
    [PTY_ENTER]: THINKING,
    [HOOK_STOP]: PENDING_REVIEW,
    [PTY_EXIT]: OFFLINE,
  },
  [OFFLINE]: {
    // 终态
  },
};

// 这些状态立即生效，不走防抖
const IMMEDIATE_STATES = new Set([OFFLINE, ERROR]);

// 这些状态受保护，不接受兜底校正（只能通过正式 FSM 事件离开）
const PROTECTED_STATES = new Set([PENDING_REVIEW]);

// 防抖最小保持时间 (ms)
const DEBOUNCE_MS = 400;

class SessionFSM {
  /**
   * @param {string} sessionId
   * @param {function} onChange - (sessionId, newState, prevState) => void
   */
  constructor(sessionId, onChange) {
    this._sessionId = sessionId;
    this._state = IDLE;
    this._onChange = onChange;
    this._lastChangeTime = 0;
    this._pendingTimer = null;
    this._pendingState = null;
    this._destroyed = false;
  }

  getState() {
    return this._state;
  }

  /**
   * 距上次状态变更的毫秒数
   */
  getElapsed() {
    return Date.now() - this._lastChangeTime;
  }

  /**
   * 派发事件，驱动状态转换
   */
  dispatch(event) {
    if (this._destroyed) return;

    const table = TRANSITIONS[this._state];
    if (!table) return;

    const nextState = table[event];
    if (!nextState || nextState === this._state) return;

    // OFFLINE / ERROR 立即生效
    if (IMMEDIATE_STATES.has(nextState)) {
      this._cancelPending();
      this._applyState(nextState);
      return;
    }

    // 防抖：距上次变更不足 DEBOUNCE_MS，延迟执行
    const elapsed = Date.now() - this._lastChangeTime;
    if (elapsed < DEBOUNCE_MS) {
      this._cancelPending();
      this._pendingState = nextState;
      this._pendingTimer = setTimeout(() => {
        this._pendingTimer = null;
        const s = this._pendingState;
        this._pendingState = null;
        if (s && s !== this._state && !this._destroyed) {
          this._applyState(s);
        }
      }, DEBOUNCE_MS - elapsed);
      return;
    }

    this._cancelPending();
    this._applyState(nextState);
  }

  /**
   * 外部校正：屏幕解析兜底发现状态不一致时调用
   * 仅在当前状态持续超过 staleMs 时才接受校正
   */
  correctIfStale(suggestedState, staleMs = 5000) {
    if (this._destroyed) return;
    if (suggestedState === this._state) return;
    if (!suggestedState) return;
    // 受保护状态不接受兜底校正，只能通过正式事件（如 SESSION_VIEWED）离开
    if (PROTECTED_STATES.has(this._state)) return;
    const elapsed = Date.now() - this._lastChangeTime;
    if (elapsed >= staleMs) {
      this._applyState(suggestedState);
    }
  }

  destroy() {
    this._destroyed = true;
    this._cancelPending();
  }

  _applyState(nextState) {
    const prev = this._state;
    this._state = nextState;
    this._lastChangeTime = Date.now();
    if (this._onChange) {
      this._onChange(this._sessionId, nextState, prev);
    }
  }

  _cancelPending() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
      this._pendingState = null;
    }
  }
}

module.exports = SessionFSM;
