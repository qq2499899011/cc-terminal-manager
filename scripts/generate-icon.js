// scripts/generate-icon.js — 生成应用图标
// 需要: npm install --save-dev sharp png-to-ico
const fs = require('fs');
const path = require('path');

async function generate() {
  const sharp = require('sharp');
  const pngToIco = require('png-to-ico').default;

  const size = 256;
  const pad = 20;
  const r = 40;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="${r}" ry="${r}" fill="#1e1e2e"/>
    <path d="M ${size / 2 + 30} ${size / 2 - 45}
             A 55 55 0 1 0 ${size / 2 + 30} ${size / 2 + 45}"
          fill="none" stroke="#89b4fa" stroke-width="22" stroke-linecap="round"/>
  </svg>`;

  const pngBuf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

  const outDir = path.resolve(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });

  const pngPath = path.join(outDir, 'icon.png');
  fs.writeFileSync(pngPath, pngBuf);
  console.log('Generated', pngPath);

  // 生成多尺寸 PNG 临时文件，再合成 ICO
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tmpPaths = [];
  for (const s of sizes) {
    const tmp = path.join(outDir, `icon-${s}.png`);
    await sharp(pngBuf).resize(s, s).png().toFile(tmp);
    tmpPaths.push(tmp);
  }

  const icoBuf = await pngToIco(tmpPaths);
  const icoPath = path.join(outDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuf);
  console.log('Generated', icoPath);

  // 清理临时文件
  for (const tmp of tmpPaths) {
    fs.unlinkSync(tmp);
  }
}

generate().catch(e => { console.error(e); process.exit(1); });
