const locales = {};

let current = 'en';

function loadLocales() {
  if (Object.keys(locales).length > 0) return;
  try {
    locales['en'] = require('./locales/en.json');
    locales['zh-CN'] = require('./locales/zh-CN.json');
  } catch {}
}

function detectDefaultLocale() {
  try {
    if (typeof navigator !== 'undefined') {
      return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
    }
    const { app } = require('electron');
    return app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  } catch {
    return 'en';
  }
}

function setLocale(lang) {
  loadLocales();
  current = lang || detectDefaultLocale();
}

function getLocale() {
  return current;
}

function t(key, ...args) {
  loadLocales();
  let str = locales[current]?.[key] || locales['en']?.[key] || key;
  args.forEach((v, i) => { str = str.replaceAll(`{${i}}`, v); });
  return str;
}

// Initialize with system default
setLocale(null);

module.exports = { t, setLocale, getLocale, detectDefaultLocale };
