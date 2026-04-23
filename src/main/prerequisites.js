const { execFile } = require('child_process');
const { t } = require('../shared/i18n');

function checkClaudeCLI() {
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { shell: true, timeout: 5000 }, (err, stdout) => {
      resolve({
        name: t('prereq_claude_cli'),
        status: err ? 'fail' : 'pass',
        message: err ? t('prereq_fail') : stdout.trim(),
        remedy: 'https://docs.anthropic.com/en/docs/claude-code',
      });
    });
  });
}

function checkShell() {
  const shells = ['pwsh', 'powershell', 'cmd'];
  return new Promise((resolve) => {
    let found = false;
    let remaining = shells.length;
    const finish = () => {
      if (--remaining === 0 && !found) {
        resolve({
          name: t('prereq_shell'),
          status: 'fail',
          message: t('prereq_fail'),
          remedy: '',
        });
      }
    };
    for (const sh of shells) {
      execFile('where', [sh], { shell: true, timeout: 3000 }, (err) => {
        if (!err && !found) {
          found = true;
          resolve({
            name: t('prereq_shell'),
            status: 'pass',
            message: t('prereq_pass') + ` (${sh})`,
          });
        }
        finish();
      });
    }
  });
}

async function checkAll() {
  const checks = await Promise.all([checkClaudeCLI(), checkShell()]);
  const ok = checks.every(c => c.status === 'pass');
  return { ok, checks };
}

module.exports = { checkAll };
