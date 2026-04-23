// 新建 / 恢复 Session 弹窗
import { getLocale } from './main.js';
import en from '../shared/locales/en.json';
import zhCN from '../shared/locales/zh-CN.json';

const _locales = { 'en': en, 'zh-CN': zhCN };
function t(key, ...args) {
  const cur = getLocale();
  let str = _locales[cur]?.[key] || _locales['en']?.[key] || key;
  args.forEach((v, i) => { str = str.replaceAll(`{${i}}`, v); });
  return str;
}

const modalOverlay = document.getElementById('modal-overlay');

let currentTab = 'new'; // 'new' | 'resume'
let historySessions = [];
let cwdList = [];
let searchQuery = '';
let lastUsedCwd = '';
let lastUsedMode = 'default';

// 外部注入的回调
let _onCreateSession = null;
let _getOpenSessionIds = null;
let _onActivateExisting = null;

// 全文搜索相关
let _fullTextMatchIds = null; // Set<sessionId> | null
let _searchDebounceTimer = null;

export async function showNewSessionModal(onCreateSession, opts = {}) {
  _onCreateSession = onCreateSession;
  _getOpenSessionIds = opts.getOpenSessionIds || null;
  _onActivateExisting = opts.onActivateExisting || null;

  // 加载数据
  try {
    [historySessions, cwdList] = await Promise.all([
      window.ccAPI.listHistory(),
      window.ccAPI.getCwdHistory(),
    ]);
  } catch (e) {
    console.error('Failed to load history:', e);
    historySessions = [];
    cwdList = [];
  }

  searchQuery = '';
  _fullTextMatchIds = null;
  currentTab = 'new';
  render();
  modalOverlay.classList.remove('hidden');
}

export function hideModal() {
  modalOverlay.classList.add('hidden');
  modalOverlay.innerHTML = '';
  if (_searchDebounceTimer) {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = null;
  }
}

/** 读取当前弹窗中模式下拉的值 */
function getSelectedMode() {
  const sel = modalOverlay.querySelector('#mode-select');
  return sel ? sel.value : lastUsedMode;
}

function render() {
  modalOverlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-tabs">
          <span class="modal-tab ${currentTab === 'new' ? 'active' : ''}" data-tab="new">${t('modal_new_cc')}</span>
          <span class="modal-tab ${currentTab === 'resume' ? 'active' : ''}" data-tab="resume">${t('modal_resume')}</span>
        </div>
        <span class="modal-close" style="cursor:pointer;font-size:18px;">×</span>
      </div>
      <div class="modal-mode-bar" style="padding:8px 16px;border-bottom:1px solid #313244;display:flex;align-items:center;gap:8px;">
        <label style="color:var(--text-secondary);font-size:12px;flex-shrink:0;">${t('modal_mode')}</label>
        <select id="mode-select" style="background:var(--bg-overlay);border:1px solid #313244;color:var(--text-primary);padding:4px 8px;border-radius:4px;font-size:12px;flex:1;">
          <option value="default" ${lastUsedMode === 'default' ? 'selected' : ''}>${t('modal_mode_default')}</option>
          <option value="yolo" ${lastUsedMode === 'yolo' ? 'selected' : ''}>${t('modal_mode_yolo')}</option>
          <option value="plan" ${lastUsedMode === 'plan' ? 'selected' : ''}>${t('modal_mode_plan')}</option>
        </select>
      </div>
      <div class="modal-body">
        ${currentTab === 'new' ? renderNewTab() : renderResumeTab()}
      </div>
      ${currentTab === 'new' ? `
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">${t('cancel')}</button>
        <button class="btn btn-primary" id="modal-create">${t('modal_create')}</button>
      </div>` : ''}
    </div>
  `;

  // 模式下拉变更时记住选择
  const modeSelect = modalOverlay.querySelector('#mode-select');
  modeSelect.addEventListener('change', () => {
    lastUsedMode = modeSelect.value;
  });

  // 事件绑定
  modalOverlay.querySelector('.modal-close').addEventListener('click', hideModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) hideModal();
  });

  // Tab 切换
  modalOverlay.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // 切换前保存当前模式选择
      lastUsedMode = getSelectedMode();
      currentTab = tab.dataset.tab;
      render();
    });
  });

  if (currentTab === 'new') {
    const cwdInput = modalOverlay.querySelector('#cwd-input');
    const browseBtn = modalOverlay.querySelector('#btn-browse');
    const createBtn = modalOverlay.querySelector('#modal-create');
    const cancelBtn = modalOverlay.querySelector('#modal-cancel');

    browseBtn.addEventListener('click', async () => {
      const dir = await window.ccAPI.openDirectoryDialog();
      if (dir) cwdInput.value = dir;
    });

    createBtn.addEventListener('click', () => {
      const cwd = cwdInput.value.trim() || cwdList[0] || '';
      const mode = getSelectedMode();
      lastUsedCwd = cwd;
      lastUsedMode = mode;
      _onCreateSession(cwd, null, mode);
      hideModal();
    });

    cancelBtn.addEventListener('click', hideModal);

    // Enter 键创建
    cwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
    });
  } else {
    // 恢复 tab
    const searchInput = modalOverlay.querySelector('#search-input');
    if (searchInput) {
      searchInput.value = searchQuery;
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        // 立即做元数据过滤
        _fullTextMatchIds = null;
        renderSessionList();

        // 防抖全文搜索（>= 2 字符时触发）
        if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
        if (searchQuery.trim().length >= 2) {
          _searchDebounceTimer = setTimeout(async () => {
            try {
              const matchingIds = await window.ccAPI.searchHistory(searchQuery.trim());
              _fullTextMatchIds = new Set(matchingIds);
              renderSessionList();
            } catch (e) {
              console.error('Full-text search failed:', e);
            }
          }, 300);
        }
      });
      searchInput.focus();
    }

    // session 点击
    bindSessionClicks();
  }
}

function renderNewTab() {
  const options = cwdList.map(c => `<option value="${escHtml(c)}">`).join('');
  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <label style="color:var(--text-secondary);font-size:12px;">${t('modal_cwd_label', cwdList.length)}</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="cwd-input" list="cwd-datalist"
               placeholder="${t('modal_cwd_placeholder')}"
               value="${escHtml(lastUsedCwd)}"
               style="flex:1;">
        <datalist id="cwd-datalist">${options}</datalist>
        <button class="btn btn-secondary" id="btn-browse">${t('modal_browse')}</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);">${t('modal_cwd_hint')}</div>
    </div>
  `;
}

function renderResumeTab() {
  return `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <input type="search" id="search-input" placeholder="${t('modal_search_placeholder')}">
      <div id="session-list-container" style="max-height:400px;overflow-y:auto;"></div>
    </div>
  `;
}

function renderSessionList() {
  const container = modalOverlay.querySelector('#session-list-container');
  if (!container) return;

  const q = searchQuery.toLowerCase();
  const openIds = _getOpenSessionIds ? _getOpenSessionIds() : new Set();

  const filtered = historySessions.filter(s => {
    if (!q) return true;
    // 元数据匹配
    const metaMatch = (s.cwd || '').toLowerCase().includes(q) ||
           (s.title || '').toLowerCase().includes(q) ||
           (s.customName || '').toLowerCase().includes(q) ||
           (s.sessionId || '').toLowerCase().includes(q);
    if (metaMatch) return true;
    // 全文搜索结果匹配
    if (_fullTextMatchIds && _fullTextMatchIds.has(s.sessionId)) return true;
    return false;
  });

  // 按 cwd 分组
  const groups = new Map();
  for (const s of filtered) {
    const cwd = s.cwd || 'Unknown';
    if (!groups.has(cwd)) groups.set(cwd, []);
    groups.get(cwd).push(s);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);padding:20px;text-align:center;">${t('no_results')}</div>`;
    return;
  }

  let html = '';
  for (const [cwd, items] of groups) {
    const groupId = 'rg-' + hashStr(cwd);
    html += `<div class="resume-group">
      <div class="resume-cwd-header" data-group="${groupId}" style="font-size:11px;color:var(--text-muted);padding:8px 0 4px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none;">
        <span class="arrow" style="font-size:10px;transition:transform 0.15s;">▼</span>
        ${escHtml(shortenPath(cwd))}
        <span style="font-size:10px;color:var(--text-muted);margin-left:auto;">${items.length}</span>
      </div>
      <div class="resume-cwd-items" id="${groupId}">`;
    for (const s of items.slice(0, 30)) {
      const time = new Date(s.lastMtime).toLocaleString(getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const isOpen = openIds.has(s.sessionId);
      // B5: 优先显示自定义名称
      const displayName = s.customName || s.title || '(empty)';
      const subtitle = s.customName && s.title ? `<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">${escHtml(s.title.slice(0, 40))}</span>` : '';
      const openBadge = isOpen ? `<span style="color:var(--green);font-size:10px;margin-left:auto;flex-shrink:0;">${t('already_open')}</span>` : '';
      html += `<div class="resume-item" data-session-id="${escHtml(s.sessionId)}" data-cwd="${escHtml(s.cwd || '')}" data-is-open="${isOpen}">
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(displayName)}</span>${subtitle}${openBadge}
        </div>
        <div style="font-size:11px;color:var(--text-muted);">${time} · ${escHtml(s.sessionId.slice(0, 8))}</div>
      </div>`;
    }
    html += '</div></div>';
  }
  container.innerHTML = html;

  // 折叠事件
  container.querySelectorAll('.resume-cwd-header').forEach(header => {
    header.addEventListener('click', () => {
      const groupId = header.dataset.group;
      const items = container.querySelector('#' + groupId);
      const arrow = header.querySelector('.arrow');
      if (items.style.display === 'none') {
        items.style.display = '';
        arrow.style.transform = '';
      } else {
        items.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }
    });
  });

  bindSessionClicks();
}

function bindSessionClicks() {
  modalOverlay.querySelectorAll('.resume-item').forEach(el => {
    el.addEventListener('click', () => {
      const sessionId = el.dataset.sessionId;
      const cwd = el.dataset.cwd;

      // B3: 已打开的 session 直接跳转，不新建
      if (el.dataset.isOpen === 'true' && _onActivateExisting) {
        _onActivateExisting(sessionId);
        hideModal();
        return;
      }

      const mode = getSelectedMode();
      lastUsedCwd = cwd;
      lastUsedMode = mode;
      _onCreateSession(cwd, sessionId, mode);
      hideModal();
    });
  });

  // 初始渲染 session list
  const container = modalOverlay.querySelector('#session-list-container');
  if (container && !container.hasChildNodes()) {
    renderSessionList();
  }
}

function shortenPath(p) {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length > 3 ? '.../' + parts.slice(-2).join('/') : p;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
