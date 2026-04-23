// scripts/build-hook-exe.js — 使用 @yao-pkg/pkg 将 cc-hook.js 编译为独立 exe
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const input = path.resolve(__dirname, '..', 'hook-scripts', 'cc-hook.js');
const outputDir = path.resolve(__dirname, '..', 'dist-hook');
const output = path.join(outputDir, 'cc-hook.exe');

fs.mkdirSync(outputDir, { recursive: true });

const cmd = `npx @yao-pkg/pkg "${input}" --targets node20-win-x64 --output "${output}" --compress GZip`;

console.log('Building cc-hook.exe...');
console.log(cmd);

const child = exec(cmd, { cwd: path.resolve(__dirname, '..') });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('exit', (code) => {
  if (code === 0) {
    const stat = fs.statSync(output);
    console.log(`Done: ${output} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.error('Build failed with code', code);
    process.exit(code);
  }
});
