const os = require('os');
const path = require('path');
const log = require('electron-log');

const homeDir = os.homedir();

log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.file.rotationCount = 5;
log.transports.file.resolvePathFn = () =>
  path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'cc-terminal-manager', 'logs', 'main.log');

const isDev = process.argv.includes('--dev');
log.transports.file.level = isDev ? 'debug' : 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';

function scrub(val) {
  return String(val)
    .replaceAll(homeDir, '~')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<session-id>');
}

log.hooks.push((message) => {
  message.data = message.data.map(v => (typeof v === 'string' ? scrub(v) : v));
  return message;
});

log.catchErrors({ showDialog: false });

function getLogDir() {
  return path.dirname(log.transports.file.resolvePathFn());
}

module.exports = log;
module.exports.getLogDir = getLogDir;
