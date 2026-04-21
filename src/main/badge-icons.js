const { nativeImage } = require('electron');

// ---- 5x7 ??????????? 0-9 ? "+" ----
const FONT_5x7 = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','10100','00100','00100','00100','11111'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
};

const CHAR_W = 5;
const CHAR_H = 7;

/**
 * ? buffer ? (x,y) ??????
 */
function putPixel(buf, size, x, y, r, g, b, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  // ?????? alpha ??????????????????
  const srcA = a / 255;
  const dstA = buf[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  buf[idx]     = Math.round((r * srcA + buf[idx]     * dstA * (1 - srcA)) / outA);
  buf[idx + 1] = Math.round((g * srcA + buf[idx + 1] * dstA * (1 - srcA)) / outA);
  buf[idx + 2] = Math.round((b * srcA + buf[idx + 2] * dstA * (1 - srcA)) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

/**
 * ???????????????
 * scale=1 ? 5x7?scale=2 ? 10x14?????
 */
function drawChar(buf, size, ch, x0, y0, scale, r, g, b) {
  const glyph = FONT_5x7[ch];
  if (!glyph) return;
  for (let row = 0; row < CHAR_H; row++) {
    const line = glyph[row];
    for (let col = 0; col < CHAR_W; col++) {
      if (line[col] === '1') {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            putPixel(buf, size, x0 + col * scale + sx, y0 + row * scale + sy, r, g, b);
          }
        }
      }
    }
  }
}

/**
 * ????????????? = 1 * scale ???
 */
function drawTextCentered(buf, size, text, cx, cy, scale, r, g, b) {
  const charW = CHAR_W * scale;
  const charH = CHAR_H * scale;
  const gap = Math.max(1, scale);
  const totalW = text.length * charW + (text.length - 1) * gap;
  const x0 = Math.round(cx - totalW / 2);
  const y0 = Math.round(cy - charH / 2);
  for (let i = 0; i < text.length; i++) {
    drawChar(buf, size, text[i], x0 + i * (charW + gap), y0, scale, r, g, b);
  }
}

/**
 * ???????????
 */
function fillCircle(buf, size, cx, cy, r, R, G, B) {
  const r2 = r * r;
  const rOut = r + 0.5, rOut2 = rOut * rOut;
  for (let y = Math.max(0, Math.floor(cy - rOut)); y <= Math.min(size - 1, Math.ceil(cy + rOut)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rOut)); x <= Math.min(size - 1, Math.ceil(cx + rOut)); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        putPixel(buf, size, x, y, R, G, B, 255);
      } else if (d2 <= rOut2) {
        const t = 1 - (Math.sqrt(d2) - r);
        putPixel(buf, size, x, y, R, G, B, Math.round(255 * t));
      }
    }
  }
}

// ======== ???? ========
// 32x32 —— ????? Windows ????? DPI
const TRAY_SIZE = 32;

function createTrayIcon(count) {
  const size = TRAY_SIZE;
  const buf = Buffer.alloc(size * size * 4);

  // ?????????
  drawRoundedRect(buf, size, 0, 0, size, size, 6, 0x89, 0xb4, 0xfa);

  // ????? "C"?????????
  drawLogoC(buf, size);

  // ?????
  if (count > 0) {
    drawBadge(buf, size, count);
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

/**
 * ?????
 */
function drawRoundedRect(buf, size, x, y, w, h, radius, r, g, b) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      // ????
      let alpha = 255;
      const corners = [
        [x + radius, y + radius],             // tl
        [x + w - radius - 1, y + radius],     // tr
        [x + radius, y + h - radius - 1],     // bl
        [x + w - radius - 1, y + h - radius - 1], // br
      ];
      const inCorner =
        (px < x + radius && py < y + radius) ||
        (px >= x + w - radius && py < y + radius) ||
        (px < x + radius && py >= y + h - radius) ||
        (px >= x + w - radius && py >= y + h - radius);
      if (inCorner) {
        let cx, cy;
        if (px < x + radius && py < y + radius) { cx = corners[0][0]; cy = corners[0][1]; }
        else if (px >= x + w - radius && py < y + radius) { cx = corners[1][0]; cy = corners[1][1]; }
        else if (px < x + radius && py >= y + h - radius) { cx = corners[2][0]; cy = corners[2][1]; }
        else { cx = corners[3][0]; cy = corners[3][1]; }
        const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (d > radius + 0.5) { alpha = 0; }
        else if (d > radius - 0.5) { alpha = Math.round(255 * (radius + 0.5 - d)); }
      }
      if (alpha > 0) putPixel(buf, size, px, py, r, g, b, alpha);
    }
  }
}

/**
 * ? 32x32 ??????????? C
 */
function drawLogoC(buf, size) {
  const cx = size / 2 - 1, cy = size / 2;
  const rOuter = 9, rInner = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const inRing = d2 <= rOuter * rOuter && d2 >= rInner * rInner;
      // ?????x > cx ? |dy| < 4
      const isOpening = dx > 2 && Math.abs(dy) < 4;
      if (inRing && !isOpening) {
        putPixel(buf, size, x, y, 0xff, 0xff, 0xff, 230);
      }
    }
  }
}

/**
 * ???????????????? + ??
 * 32x32 ??????? (24, 8) ?? 7???? scale=1 ? 5x7 ??
 */
function drawBadge(buf, size, count) {
  const bcx = 23, bcy = 8, br = 7.5;
  // ????
  fillCircle(buf, size, bcx, bcy, br + 0.5, 0xff, 0xff, 0xff);
  // ????
  fillCircle(buf, size, bcx, bcy, br - 0.5, 0xf3, 0x8b, 0xa8);

  const text = count > 9 ? '9+' : String(count);
  // ????scale=1?5x7????? "9+"?scale=1
  drawTextCentered(buf, size, text, bcx, bcy, 1, 0xff, 0xff, 0xff);
}

// ======== ??? overlay ?? ========
// 32x32 ? overlay —— Windows ??????????????????????
const OVERLAY_SIZE = 32;

function createOverlayIcon(count) {
  if (count <= 0) return null;
  const size = OVERLAY_SIZE;
  const buf = Buffer.alloc(size * size * 4);

  // ??????? 1px ????
  const cx = size / 2 - 0.5, cy = size / 2 - 0.5;
  fillCircle(buf, size, cx, cy, size / 2 - 0.5, 0xff, 0xff, 0xff);
  fillCircle(buf, size, cx, cy, size / 2 - 2, 0xf3, 0x8b, 0xa8);

  // ????????? scale=3 (15x21)????? scale=2 (10x14) ???
  const text = count > 9 ? '9+' : String(count);
  const scale = text.length === 1 ? 3 : 2;
  drawTextCentered(buf, size, text, cx + 0.5, cy + 0.5, scale, 0xff, 0xff, 0xff);

  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

module.exports = { createTrayIcon, createOverlayIcon };
