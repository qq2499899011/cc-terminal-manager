const log = require('./logger');
const pkg = require('../../package.json');

let _getMainWindow = null;

function init(getMainWindow) {
  _getMainWindow = getMainWindow;
  setTimeout(() => checkForUpdates(), 15000);
  setInterval(() => checkForUpdates(), 4 * 3600 * 1000);
}

async function checkForUpdates() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/qq2499899011/cc-terminal-manager/releases/latest`,
      { headers: { 'User-Agent': 'cc-terminal-manager' } }
    );
    if (!res.ok) return;
    const data = await res.json();
    const latest = data.tag_name.replace(/^v/, '');
    if (compareVersions(latest, pkg.version) > 0) {
      const win = _getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send('update:available-lite', {
          version: latest,
          url: data.html_url,
        });
      }
    }
  } catch (e) {
    log.debug('[updater-lite] check failed:', e.message);
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

module.exports = { init, checkForUpdates };
