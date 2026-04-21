// FSM 状态与事件常量

// 状态
const IDLE = 'idle';
const THINKING = 'thinking';
const WAITING = 'waiting';
const PENDING_REVIEW = 'pending_review';
const ERROR = 'error';
const OFFLINE = 'offline';

// 事件
const PTY_ENTER = 'PTY_ENTER';
const PTY_ESC = 'PTY_ESC';
const HOOK_STOP = 'HOOK_STOP';
const HOOK_NOTIFICATION = 'HOOK_NOTIFICATION';
const HOOK_STOP_FAILURE = 'HOOK_STOP_FAILURE';
const PTY_EXIT = 'PTY_EXIT';
const SESSION_VIEWED = 'SESSION_VIEWED';

module.exports = {
  // 状态
  IDLE, THINKING, WAITING, PENDING_REVIEW, ERROR, OFFLINE,
  // 事件
  PTY_ENTER, PTY_ESC, HOOK_STOP, HOOK_NOTIFICATION, HOOK_STOP_FAILURE, PTY_EXIT, SESSION_VIEWED,
};
