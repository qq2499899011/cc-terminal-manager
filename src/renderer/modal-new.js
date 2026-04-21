// 新建 / 恢复 Session 弹窗

const modalOverlay = document.getElementById('modal-overlay');

let currentTab = 'new'; // 'new' | 'resume'
let historySessions = [];
let cwdList = [];
let searchQuery = '';

export async function showNewSessionModal(onCreateSession) {
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
  currentTab = 'new';
  render(onCreateSession);
  modalOverlay.classList.remove('hidden');
}

export function hideModal() {
  modalOverlay.classList.add('hidden');
  modalOverlay.innerHTML = '';
}

function render(onCreateSession) {
  modalOverlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-tabs">
          <span class="modal-tab ${currentTab === 'new' ? 'active' : ''}" data-tab="new">新建 CC</span>
          <span class="modal-tab ${currentTab === 'resume' ? 'active' : ''}" data-tab="resume">从历史恢复</span>
        </div>
        <span class="modal-close" style="cursor:pointer;font-size:18px;">×</span>
      </div>
      <div class="modal-body">
        ${currentTab === 'new' ? renderNewTab() : renderResumeTab()}
      </div>
      ${currentTab === 'new' ? `
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">取消</button>
        <button class="btn btn-primary" id="modal-create">创建</button>
      </div>` : ''}
    </div>
  `;

  // 事件绑定
  modalOverlay.querySelector('.modal-close').addEventListener('click', hideModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) hideModal();
  });

  // Tab 切换
  modalOverlay.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      render(onCreateSession);
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
      const cwd = cwdInput.value.trim() || cwdList[0] || 'C:\\projects\\AI-Studio';
      onCreateSession(cwd, null);
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
        renderSessionList(onCreateSession);
      });
      searchInput.focus();
    }

    // session 点击
    bindSessionClicks(onCreateSession);
  }
}

function renderNewTab() {
  // cwdList 已经是从所有历史 session 去重的完整 cwd 集合
  const options = cwdList.map(c => `<option value="${escHtml(c)}">`).join('');
  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <label style="color:var(--text-secondary);font-size:12px;">工作目录 (${cwdList.length} 个历史路径)</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="cwd-input" list="cwd-datalist"
               placeholder="选择或输入工作目录..."
               value=""
               style="flex:1;">
        <datalist id="cwd-datalist">${options}</datalist>
        <button class="btn btn-secondary" id="btn-browse">浏览</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);">点击输入框下拉选择，或直接输入路径</div>
    </div>
  `;
}

function renderResumeTab() {
  return `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <input type="search" id="search-input" placeholder="搜索 session...">
      <div id="session-list-container" style="max-height:400px;overflow-y:auto;"></div>
    </div>
  `;
}

function renderSessionList(onCreateSession) {
  const container = modalOverlay.querySelector('#session-list-container');
  if (!container) return;

  const q = searchQuery.toLowerCase();
  const filtered = historySessions.filter(s => {
    if (!q) return true;
    return (s.cwd || '').toLowerCase().includes(q) ||
           (s.title || '').toLowerCase().includes(q) ||
           (s.sessionId || '').toLowerCase().includes(q);
  });

  // 按 cwd 分组
  const groups = new Map();
  for (const s of filtered) {
    const cwd = s.cwd || 'Unknown';
    if (!groups.has(cwd)) groups.set(cwd, []);
    groups.get(cwd).push(s);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center;">无匹配结果</div>';
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
      const time = new Date(s.lastMtime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      html += `<div class="resume-item" data-session-id="${escHtml(s.sessionId)}" data-cwd="${escHtml(s.cwd || '')}">
        <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(s.title || '(empty)')}</div>
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

  bindSessionClicks(onCreateSession);
}

function bindSessionClicks(onCreateSession) {
  modalOverlay.querySelectorAll('.resume-item').forEach(el => {
    el.addEventListener('click', () => {
      const sessionId = el.dataset.sessionId;
      const cwd = el.dataset.cwd;
      onCreateSession(cwd, sessionId);
      hideModal();
    });
  });

  // 初始渲染 session list
  const container = modalOverlay.querySelector('#session-list-container');
  if (container && !container.hasChildNodes()) {
    renderSessionList(onCreateSession);
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
