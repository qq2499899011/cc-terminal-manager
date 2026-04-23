const fs = require('fs');
const path = require('path');
const log = require('./logger');
const { APP_DATA_DIR, META_FILE } = require('./paths');

const DEFAULT_META = {
  sessionMeta: {},    // claudeSessionId -> { name, pinned }
  cwdHistory: [],     // 最近使用的 cwd，最多 20 条
  settings: {
    defaultShell: 'pwsh',
    hooksEnabled: true,
    notifyOnStop: true,
    language: '',
  },
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    // 合并默认值
    cache = { ...DEFAULT_META, ...cache, settings: { ...DEFAULT_META.settings, ...cache.settings } };
  } catch {
    cache = { ...DEFAULT_META };
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    fs.writeFileSync(META_FILE, JSON.stringify(cache, null, 2), 'utf8');
    return true;
  } catch (e) {
    log.error('[session-store] save failed:', e.message);
    return false;
  }
}

function getSessionName(claudeSessionId) {
  const meta = load();
  return meta.sessionMeta[claudeSessionId]?.name || null;
}

function setSessionName(claudeSessionId, name) {
  const meta = load();
  if (!meta.sessionMeta[claudeSessionId]) {
    meta.sessionMeta[claudeSessionId] = {};
  }
  meta.sessionMeta[claudeSessionId].name = name || null;
  save();
}

function addCwdHistory(cwd) {
  if (!cwd) return;
  const meta = load();
  meta.cwdHistory = [cwd, ...meta.cwdHistory.filter(c => c !== cwd)].slice(0, 20);
  save();
}

function getCwdHistory() {
  return load().cwdHistory;
}

function getSettings() {
  return load().settings;
}

function setSettings(partial) {
  const meta = load();
  Object.assign(meta.settings, partial);
  save();
  return meta.settings;
}

module.exports = {
  load, save,
  getSessionName, setSessionName,
  addCwdHistory, getCwdHistory,
  getSettings, setSettings,
};
