const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MARKER = '__cc_manager__';

function uninstall() {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  } catch { return false; }

  if (settings.hooks) {
    if (settings.hooks.Stop) {
      settings.hooks.Stop = removeMarked(settings.hooks.Stop);
      if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    }
    if (settings.hooks.Notification) {
      settings.hooks.Notification = removeMarked(settings.hooks.Notification);
      if (settings.hooks.Notification.length === 0) delete settings.hooks.Notification;
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  if (settings.env) {
    delete settings.env.CC_MANAGER_HOOK_PORT;
    if (Object.keys(settings.env).length === 0) delete settings.env;
  }

  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2), 'utf8');
  return true;
}

function removeMarked(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => {
    if (!entry.hooks) return true;
    entry.hooks = entry.hooks.filter(h => h._marker !== MARKER);
    return entry.hooks.length > 0;
  });
}

module.exports = { uninstall };
