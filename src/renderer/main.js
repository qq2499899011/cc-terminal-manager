// 渲染端入口
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { showNewSessionModal } from './modal-new.js';

console.log('CC Terminal Manager renderer loaded');

// 事件总线
class EventBus {
  constructor() { this._handlers = {}; }
  on(event, handler) {
    (this._handlers[event] ||= []).push(handler);
  }
  off(event, handler) {
    const h = this._handlers[event];
    if (h) this._handlers[event] = h.filter(fn => fn !== handler);
  }
  emit(event, ...args) {
    (this._handlers[event] || []).forEach(fn => fn(...args));
  }
}

export const bus = new EventBus();

// 全局状态
export const state = {
  sessions: new Map(),    // internalId -> { term, fitAddon, container, info }
  activeSessionId: null,
};

const termContainer = document.getElementById('terminal-container');
const tabBar = document.getElementById('tab-bar');
const sessionList = document.getElementById('session-list');
const btnNew = document.getElementById('btn-new-session');
const btnRefresh = document.getElementById('btn-refresh');
const modalOverlay = document.getElementById('modal-overlay');

// ---- xterm 主题 ----
const THEME = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  selectionBackground: '#45475a',
  selectionForeground: '#cdd6f4',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

// ---- 创建终端 ----
function createTerminal(sessionId) {
  const term = new Terminal({
    theme: THEME,
    fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
    fontSize: 14,
    cursorBlink: true,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  const wrapper = document.createElement('div');
  wrapper.className = 'xterm-wrapper';
  wrapper.dataset.sessionId = sessionId;
  termContainer.appendChild(wrapper);

  term.open(wrapper);
  fitAddon.fit();

  // 输入转发到 PTY
  term.onData((data) => {
    window.ccAPI.ptyInput(sessionId, data);
  });

  // resize 转发
  term.onResize(({ cols, rows }) => {
    window.ccAPI.ptyResize(sessionId, cols, rows);
  });

  return { term, fitAddon, container: wrapper };
}

// ---- Tab 管理 ----
function renderTabs() {
  tabBar.innerHTML = '';
  for (const [id, s] of state.sessions) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (id === state.activeSessionId ? ' active' : '');
    tab.dataset.sessionId = id;

    const label = s.info?.name || shortenCwd(s.info?.cwd) || 'Terminal';
    const dot = document.createElement('span');
    dot.className = 'status-dot dot-' + (s.info?.status || 'running');
    tab.appendChild(dot);

    const text = document.createElement('span');
    text.textContent = label;
    tab.appendChild(text);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSession(id);
    });
    tab.appendChild(close);

    tab.addEventListener('click', () => activateSession(id));
    tabBar.appendChild(tab);
  }
}

function shortenCwd(cwd) {
  if (!cwd) return '';
  const parts = cwd.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? '...' + '/' + parts.slice(-2).join('/') : cwd;
}

// ---- 侧栏渲染 ----
function renderSidebar() {
  sessionList.innerHTML = '';
  // 按 cwd 分组
  const groups = new Map();
  for (const [id, s] of state.sessions) {
    const cwd = s.info?.cwd || 'Unknown';
    if (!groups.has(cwd)) groups.set(cwd, []);
    groups.get(cwd).push({ id, ...s });
  }

  for (const [cwd, items] of groups) {
    const group = document.createElement('div');
    group.className = 'cwd-group';

    const header = document.createElement('div');
    header.className = 'cwd-header';
    header.innerHTML = `<span class="arrow">▼</span> ${shortenCwd(cwd)}`;
    header.addEventListener('click', () => {
      group.classList.toggle('collapsed');
      header.querySelector('.arrow').classList.toggle('collapsed');
    });
    group.appendChild(header);

    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'session-items';
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'session-item' + (item.id === state.activeSessionId ? ' active' : '');
      el.dataset.sessionId = item.id;

      const dot = document.createElement('span');
      dot.className = 'status-dot dot-' + (item.info?.status || 'running');
      el.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'session-name';
      name.textContent = item.info?.name || 'Session';
      el.appendChild(name);

      // 悬浮显示的改名按钮
      const renameBtn = document.createElement('span');
      renameBtn.className = 'rename-btn';
      renameBtn.textContent = '✎';
      renameBtn.title = '重命名';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startRename(item.id);
      });
      el.appendChild(renameBtn);

      el.addEventListener('click', () => activateSession(item.id));
      itemsDiv.appendChild(el);
    }
    group.appendChild(itemsDiv);
    sessionList.appendChild(group);
  }

  if (state.sessions.size === 0) {
    sessionList.innerHTML = '<div class="empty-state">点击 + 新建终端</div>';
  }
}

// ---- Session 操作 ----
function activateSession(sessionId) {
  state.activeSessionId = sessionId;
  // 通知 main 进程当前激活的 session（用于 pending_review → idle 判定）
  try { window.ccAPI.reportSessionActivated(sessionId); } catch {}
  // 切换终端显示
  for (const [id, s] of state.sessions) {
    s.container.classList.toggle('active', id === sessionId);
    if (id === sessionId) {
      s.fitAddon.fit();
      s.term.refresh(0, s.term.rows - 1);
      s.term.focus();
    }
  }
  renderTabs();
  renderSidebar();
}

async function newSession(cwd, resumeId, mode) {
  const result = await window.ccAPI.createSession({
    cwd: cwd || 'C:\\projects\\AI-Studio',
    resumeId: resumeId || undefined,
    mode: mode || 'default',
  });

  const { internalId } = result;
  const { term, fitAddon, container } = createTerminal(internalId);

  state.sessions.set(internalId, {
    term, fitAddon, container,
    info: {
      internalId,
      cwd: cwd || 'C:\\projects\\AI-Studio',
      claudeSessionId: resumeId || null,  // 恢复时直接预填
      status: 'running',
      name: null,
      createdAt: Date.now(),
    },
  });

  activateSession(internalId);
  renderTabs();
  renderSidebar();
}

function closeSession(sessionId) {
  const s = state.sessions.get(sessionId);
  if (!s) return;

  window.ccAPI.killSession(sessionId);
  s.term.dispose();
  s.container.remove();
  state.sessions.delete(sessionId);

  if (state.activeSessionId === sessionId) {
    const next = state.sessions.keys().next().value || null;
    if (next) activateSession(next);
    else state.activeSessionId = null;
  }

  renderTabs();
  renderSidebar();
}

// ---- PTY 数据接收 + 自动命名 + 实时状态检测 ----
// 关键：不再维护原始流 tail buffer —— 原始流里 CC 用 \x1b[K / \x1b[2K 擦掉
// 的文字还在，会让 "esc to interrupt" / "1. Yes" 永远匹配。
// 改为直接读 xterm.js 已经渲染好的 "可见屏幕" —— 屏幕上看到啥，就是当前状态。

// 状态检测模式（均用 /g 以便取 "最后一次" 出现位置）
// thinking: 以下任一信号都说明 CC 正在工作；各自都会被 CC 每秒重绘好几次
//   - 文案: "esc to interrupt" / "ctrl+c to interrupt" / "ctrl-c to cancel"
//   - 星形 spinner: ✻ ✽ ✶ ✷ ✸ ✹ ✺
//   - 盲文 spinner: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷
const RE_THINKING = /esc to interrupt|ctrl[+\-]c to (?:interrupt|cancel|stop)|[\u2726-\u273d]|[\u2801-\u28ff]/gi;
// needs_approval: 审批面板标志（"Do you want to ..." 或 "❯ 1. Yes/Allow"）
const RE_APPROVAL = /Do you want to (?:proceed|make|allow|run)|\u276f\s*1\.\s*Yes|\u276f\s*1\.\s*Allow|\u276f\s*1\.\s*Accept/gi;
// running/idle: 空的输入提示框
//   新版 CC (v2.1+)：一行 "❯" 后紧跟大量空格（无侧边竖线，上下用 ─ 分隔）
//   旧版 CC：带侧边竖线 "│ > ... │"
//   注意：历史里的 "❯ 你好" / 审批的 "❯ 1. Yes" 只有 1 空格，不会被 \s{2,} 匹配
const RE_IDLE_PROMPT = /\u276f\s{2,}|[\u2502|]\s*>\s{2,}/g;

/**
 * 从 xterm.js 的 active buffer 读取 "当前屏幕可见内容"
 * —— 这是经 xterm 完整终端仿真后的结果，光标定位、擦行、擦屏都已正确应用
 */
function getScreenText(term) {
  if (!term || !term.buffer || !term.buffer.active) return '';
  const buf = term.buffer.active;
  const rows = term.rows || 30;
  // baseY = 当前主屏顶部在 buffer 中的行号；从这里读 rows 行就是 "现在看到的一屏"
  const startY = buf.baseY;
  const endY = startY + rows;
  const lines = [];
  for (let y = startY; y < endY; y++) {
    const line = buf.getLine(y);
    if (!line) continue;
    // translateToString(true) 会 trim 右侧空白；但我们要保留完整行以便 "│ > " 之后的空格能被匹配
    lines.push(line.translateToString(false));
  }
  return lines.join('\n');
}

/**
 * 返回正则在文本中最后一次匹配的起始位置，没匹配返回 -1
 */
function lastMatchIndex(text, globalRegex) {
  globalRegex.lastIndex = 0;
  let m, last = -1;
  while ((m = globalRegex.exec(text)) !== null) {
    last = m.index;
    if (m.index === globalRegex.lastIndex) globalRegex.lastIndex++;
  }
  return last;
}

/**
 * 根据可见屏幕文本推断当前状态。取出现位置最靠后的信号。
 * 原理：屏幕是 "从上到下" 渲染的，底部状态栏/面板总是最后的文字。
 *   - thinking 时：prompt 框 + spinner 行，spinner 在更下方 → thinking 胜出
 *   - idle 时：只有 prompt 框，没有 spinner 文字 → running 胜出
 *   - 审批时：审批面板在底部，包含 "❯ 1. Yes" 等 → needs_approval 胜出
 *   - 审批/thinking 结束后，那些文字会被 xterm 从屏幕清除 → 不再匹配
 */
function detectStatus(screenText) {
  if (!screenText) return null;

  const approvalIdx = lastMatchIndex(screenText, RE_APPROVAL);
  const thinkingIdx = lastMatchIndex(screenText, RE_THINKING);
  const idleIdx = lastMatchIndex(screenText, RE_IDLE_PROMPT);

  let bestStatus = null;
  let bestIdx = -1;
  if (approvalIdx > bestIdx) { bestIdx = approvalIdx; bestStatus = 'needs_approval'; }
  if (thinkingIdx > bestIdx) { bestIdx = thinkingIdx; bestStatus = 'thinking'; }
  if (idleIdx > bestIdx) { bestIdx = idleIdx; bestStatus = 'running'; }

  return bestStatus;
}

/**
 * 局部更新某个 session 的状态点样式 —— 无需重建整个 sidebar/tabbar
 */
function updateStatusDotDOM(sessionId, status) {
  const dotClass = 'status-dot dot-' + status;
  // 侧栏
  const side = document.querySelector(`.session-item[data-session-id="${sessionId}"] .status-dot`);
  if (side) side.className = dotClass;
  // tab
  const tab = document.querySelector(`.tab[data-session-id="${sessionId}"] .status-dot`);
  if (tab) tab.className = dotClass;
}

/**
 * 自动命名：从 xterm 屏幕缓冲区提取用户输入的第一条消息
 * 在 idle → thinking 转换时调用，此时屏幕上应该还残留着用户刚输入的文本
 * 查找最后一个 ❯ 提示符后面的文本内容
 */
function tryAutoName(sessionId) {
  const s = state.sessions.get(sessionId);
  if (!s || s._autoNamed) return;

  const buf = s.term.buffer?.active;
  if (!buf) return;

  // 从屏幕底部向上扫描，找到包含 ❯ 的行
  const totalLines = buf.length;
  let inputText = '';
  for (let y = totalLines - 1; y >= Math.max(0, totalLines - 50); y--) {
    const line = buf.getLine(y);
    if (!line) continue;
    const text = line.translateToString(true); // trim 右侧空白
    // 匹配 ❯ 后面的内容（CC 的输入提示符）
    const promptIdx = text.lastIndexOf('\u276f');
    if (promptIdx >= 0) {
      const after = text.slice(promptIdx + 1).trim();
      if (after) {
        inputText = after;
        break;
      }
    }
  }

  if (!inputText) return;

  // 清洗：去控制字符、截取前 30 字符
  const cleaned = inputText
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);

  if (!cleaned) return;

  s._autoNamed = true;
  s.info.name = cleaned;
  renderTabs();
  renderSidebar();

  // 通知 main 进程持久化
  try { window.ccAPI.renameSession(sessionId, cleaned); } catch {}
}

/**
 * 设置 session 状态，只有变更时才触发 DOM 更新和上报
 * 在控制台打 window.CC_DEBUG=true 后会输出检测日志，便于调试
 */
function setSessionStatus(sessionId, status) {
  const s = state.sessions.get(sessionId);
  if (!s || !status || s.info.status === status) return;
  const prevStatus = s.info.status;
  if (window.CC_DEBUG) {
    console.log('[CC-STATUS]', sessionId.slice(0, 8), prevStatus, '->', status);
  }
  s.info.status = status;
  updateStatusDotDOM(sessionId, status);
  // 上报给 main 以刷新 tray + overlay 徽标
  try { window.ccAPI.reportStatusChange(sessionId, status); } catch {}

  // 自动命名：idle → thinking 时从屏幕提取用户输入
  if (prevStatus === 'running' && status === 'thinking' && !s._autoNamed) {
    tryAutoName(sessionId);
  }
}

/**
 * 单次分析 —— 读 xterm 屏幕、推断状态、必要时更新
 */
function analyzeSessionNow(sessionId) {
  const s = state.sessions.get(sessionId);
  if (!s) return;
  if (s.info.status === 'exited') return;
  const text = getScreenText(s.term);
  const guess = detectStatus(text);
  if (window.CC_DEBUG && guess && guess !== s.info.status) {
    console.log('[CC-DETECT]', sessionId.slice(0, 8),
                s.info.status, '->', guess,
                '| screen tail:', JSON.stringify(text.slice(-120).replace(/\s+/g, ' ')));
  }
  if (guess) setSessionStatus(sessionId, guess);
}

/**
 * 事件驱动的"微节流"分析：80ms 窗口内多次 PTY 写入合并为一次分析
 */
function scheduleStatusAnalyze(sessionId) {
  const s = state.sessions.get(sessionId);
  if (!s) return;
  if (s.info.status === 'exited') return;
  if (s._analyzeTimer) return;
  s._analyzeTimer = setTimeout(() => {
    s._analyzeTimer = null;
    analyzeSessionNow(sessionId);
  }, 80);
}

window.ccAPI.onPtyData((sessionId, data) => {
  const s = state.sessions.get(sessionId);
  if (!s) return;
  s.term.write(data);

  // 当前激活终端自动滚动到底部，避免新输出不可见
  if (sessionId === state.activeSessionId) {
    s.term.scrollToBottom();
  }

  // 初始占位名（自动命名到达前显示）
  if (!s.info.name) {
    s.info.name = 'claude';
    renderTabs();
    renderSidebar();
  }
});

// ---- 兜底轮询：每 2s 扫描所有 session ----
// 主要状态由 main 进程 FSM 驱动（Hook + PTY 输入拦截），
// 这里仅作为最后防线：当 FSM 状态超过 5s 未变且屏幕内容不一致时上报校正。
setInterval(() => {
  for (const [id, s] of state.sessions) {
    if (s.info.status === 'exited') continue;
    const text = getScreenText(s.term);
    const guess = detectStatus(text);
    if (guess && guess !== s.info.status) {
      // 上报给 main 进程的 coordinator，由 FSM.correctIfStale 决定是否采纳
      try { window.ccAPI.reportStatusChange(id, guess); } catch {}
    }
    // DOM 兜底同步
    const wantClass = 'status-dot dot-' + s.info.status;
    const side = document.querySelector(`.session-item[data-session-id="${id}"] .status-dot`);
    if (side && side.className !== wantClass) side.className = wantClass;
    const tab = document.querySelector(`.tab[data-session-id="${id}"] .status-dot`);
    if (tab && tab.className !== wantClass) tab.className = wantClass;
  }
}, 2000);

// 暴露调试工具：在 DevTools Console 里跑 inspectCC() 可以看所有 session 当前屏幕 + 猜到的状态
// 返回数组，DevTools 会完整展开；同时把每个 session 的屏幕文本直接打印出来
window.inspectCC = function inspectCC(sessionId) {
  const sessions = sessionId
    ? [[sessionId, state.sessions.get(sessionId)]].filter(([, s]) => s)
    : [...state.sessions.entries()];
  const result = [];
  for (const [id, s] of sessions) {
    const buf = s.term.buffer?.active;
    const text = getScreenText(s.term);
    const guess = detectStatus(text);
    // 把屏幕文本里不可见字符也摊开，方便看 ANSI / 零宽度残留
    const codepoints = [...text].slice(-80).map(c => {
      const cp = c.codePointAt(0);
      return cp < 32 || cp === 127 ? `\\x${cp.toString(16).padStart(2, '0')}` : c;
    }).join('');
    result.push({
      id: id.slice(0, 8),
      info: s.info.status,
      detected: guess,
      rows: s.term.rows,
      cols: s.term.cols,
      bufType: buf?.type,
      baseY: buf?.baseY,
      length: buf?.length,
      textLen: text.length,
    });
    console.log(`========== [${id.slice(0, 8)}] info=${s.info.status} detected=${guess} ==========`);
    console.log(text || '(EMPTY screen text)');
    console.log('tail codepoints:', codepoints);
  }
  console.table(result);
  return result;
};

window.ccAPI.onPtyExit((sessionId, code) => {
  const s = state.sessions.get(sessionId);
  if (s) {
    s.info.status = 'exited';
    s.term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
    updateStatusDotDOM(sessionId, 'exited');
    try { window.ccAPI.reportStatusChange(sessionId, 'exited'); } catch {}
  }
});

// ---- 窗口 resize ----
window.addEventListener('resize', () => {
  for (const [id, s] of state.sessions) {
    if (id === state.activeSessionId) {
      s.fitAddon.fit();
      s.term.refresh(0, s.term.rows - 1);
    }
  }
});

// ---- 侧栏 resize 拖拽 ----
const sidebar = document.getElementById('sidebar');
const resizeHandle = document.getElementById('resize-handle');
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = Math.max(180, Math.min(400, e.clientX));
  sidebar.style.width = newWidth + 'px';
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = '';
    // refit active terminal
    const s = state.sessions.get(state.activeSessionId);
    if (s) {
      s.fitAddon.fit();
      s.term.refresh(0, s.term.rows - 1);
    }
  }
});

// ---- 按钮事件 ----
btnNew.addEventListener('click', async () => {
  console.log('[DEBUG] + button clicked');
  console.log('[DEBUG] ccAPI available:', !!window.ccAPI);
  console.log('[DEBUG] ccAPI.listHistory:', typeof window.ccAPI?.listHistory);
  try {
    await showNewSessionModal(
      (cwd, resumeId, mode) => { newSession(cwd, resumeId, mode); },
      {
        getOpenSessionIds: () => {
          const ids = new Set();
          for (const [, s] of state.sessions) {
            if (s.info.claudeSessionId) ids.add(s.info.claudeSessionId);
          }
          return ids;
        },
        onActivateExisting: (claudeSessionId) => {
          for (const [id, s] of state.sessions) {
            if (s.info.claudeSessionId === claudeSessionId) {
              activateSession(id);
              return;
            }
          }
        },
      }
    );
  } catch (e) {
    console.error('showNewSessionModal error:', e);
  }
});

btnRefresh.addEventListener('click', () => {
  renderTabs();
  renderSidebar();
});

// ---- 右键菜单 ----
let activeContextMenu = null;

function showContextMenu(x, y, sessionId) {
  hideContextMenu();
  const s = state.sessions.get(sessionId);
  if (!s) return;

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const items = [
    { label: '重命名', action: () => startRename(sessionId) },
    { label: '复制工作目录', action: () => navigator.clipboard.writeText(s.info?.cwd || '') },
    { label: '在资源管理器中打开', action: () => {
      // 通过 shell.openPath 需要 preload 暴露，这里用简单方式
      window.ccAPI.ptyInput(sessionId, ''); // placeholder
    }},
    { sep: true },
    { label: '关闭', action: () => closeSession(sessionId), danger: true },
  ];

  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      menu.appendChild(sep);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'context-menu-item';
    if (item.danger) el.style.color = 'var(--red)';
    el.textContent = item.label;
    el.addEventListener('click', () => {
      hideContextMenu();
      item.action();
    });
    menu.appendChild(el);
  }

  document.body.appendChild(menu);
  activeContextMenu = menu;

  // 确保菜单不超出窗口
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
}

function hideContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
  // 只在 session-item 上显示右键菜单
  const item = e.target.closest('.session-item');
  if (item) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, item.dataset.sessionId);
  } else {
    hideContextMenu();
  }
});

// ---- xterm 终端区域右键：选中→复制，未选中→粘贴 ----
termContainer.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const activeSession = state.sessions.get(state.activeSessionId);
  if (!activeSession) return;
  const term = activeSession.term;
  if (term.hasSelection()) {
    const text = term.getSelection();
    await navigator.clipboard.writeText(text);
    term.clearSelection();
  } else {
    try {
      const text = await navigator.clipboard.readText();
      if (text) window.ccAPI.ptyInput(state.activeSessionId, text);
    } catch {}
  }
});

// ---- 重命名 ----
function startRename(sessionId) {
  const s = state.sessions.get(sessionId);
  if (!s) return;

  const el = document.querySelector(`.session-item[data-session-id="${sessionId}"] .session-name`);
  if (!el) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = s.info?.name || '';
  input.placeholder = 'Session 名称';
  input.style.cssText = 'width:100%;font-size:12px;padding:2px 4px;background:var(--bg-overlay);border:1px solid var(--accent);color:var(--text-primary);border-radius:2px;';

  const originalText = el.textContent;
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();

  const finish = async () => {
    const name = input.value.trim();
    if (name && name !== originalText) {
      s.info.name = name;
      await window.ccAPI.renameSession(sessionId, name);
    }
    renderTabs();
    renderSidebar();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = originalText; input.blur(); }
  });
}

// ---- 双击重命名 ----
sessionList.addEventListener('dblclick', (e) => {
  const item = e.target.closest('.session-item');
  if (item) startRename(item.dataset.sessionId);
});

// ---- 状态变化监听（hooks 通道，默认关闭；开启时作为辅助信号）----
window.ccAPI.onSessionStatusChange((sessionId, status) => {
  const s = state.sessions.get(sessionId);
  if (!s || s.info.status === status) return;
  const prevStatus = s.info.status;
  s.info.status = status;
  updateStatusDotDOM(sessionId, status);

  // ---- 自动命名：idle → thinking 时从屏幕提取用户输入 ----
  if (prevStatus === 'running' && status === 'thinking' && !s._autoNamed) {
    tryAutoName(sessionId);
  }
});

window.ccAPI.onSessionBindClaudeId((internalId, claudeSessionId) => {
  const s = state.sessions.get(internalId);
  if (s) {
    s.info.claudeSessionId = claudeSessionId;
  }
});

// ---- 通知点击定位到对应 session ----
window.ccAPI.onSessionFocus((sessionId) => {
  // 先按 internalId 直接匹配
  if (state.sessions.has(sessionId)) {
    activateSession(sessionId);
    return;
  }
  // 再按 claudeSessionId 匹配
  for (const [id, s] of state.sessions) {
    if (s.info.claudeSessionId === sessionId) {
      activateSession(id);
      return;
    }
  }
});

// ---- 设置面板 ----
const btnSettings = document.getElementById('btn-settings');
btnSettings.addEventListener('click', showSettingsPanel);

async function showSettingsPanel() {
  const settings = await window.ccAPI.getSettings();
  modalOverlay.classList.remove('hidden');
  modalOverlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>设置</span>
        <span class="modal-close" style="cursor:pointer;font-size:18px;">×</span>
      </div>
      <div class="modal-body">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="set-hooks" ${settings.hooksEnabled ? 'checked' : ''}>
            <span>启用 Hooks（CC 事件通知）</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="set-notify-stop" ${settings.notifyOnStop ? 'checked' : ''}>
            <span>CC 完成时弹窗通知</span>
          </label>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">默认 Shell</label>
            <select id="set-shell" style="background:var(--bg-overlay);border:1px solid #313244;color:var(--text-primary);padding:6px 10px;border-radius:4px;font-size:13px;width:100%;">
              <option value="pwsh" ${settings.defaultShell === 'pwsh' ? 'selected' : ''}>PowerShell (pwsh)</option>
              <option value="powershell" ${settings.defaultShell === 'powershell' ? 'selected' : ''}>Windows PowerShell</option>
              <option value="cmd" ${settings.defaultShell === 'cmd' ? 'selected' : ''}>CMD</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="settings-cancel">取消</button>
        <button class="btn btn-primary" id="settings-save">保存</button>
      </div>
    </div>
  `;

  const closeModal = () => { modalOverlay.classList.add('hidden'); modalOverlay.innerHTML = ''; };
  modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
  modalOverlay.querySelector('#settings-cancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  modalOverlay.querySelector('#settings-save').addEventListener('click', async () => {
    const hooksEnabled = modalOverlay.querySelector('#set-hooks').checked;
    const notifyOnStop = modalOverlay.querySelector('#set-notify-stop').checked;
    const defaultShell = modalOverlay.querySelector('#set-shell').value;

    await window.ccAPI.setSettings({ hooksEnabled, notifyOnStop, defaultShell });

    // 启用/禁用 hooks
    if (hooksEnabled) {
      await window.ccAPI.enableHooks();
    } else {
      await window.ccAPI.disableHooks();
    }

    closeModal();
  });
}

// ---- 初始化 ----
renderSidebar();
