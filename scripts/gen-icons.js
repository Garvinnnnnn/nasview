/* 生成 NodePulse 图标 PNG（纯 Node + zlib，无第三方依赖） */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// 简易圆角矩形 signed distance 判断 + 波形线绘制
function render(size, maskable) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const pad = maskable ? size * 0.14 : 0;
  const radius = maskable ? 0 : size * 0.22;
  const inner = size - pad * 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      let r, g, b, a = 255;
      // 圆角矩形裁切
      const lx = x - pad, ly = y - pad;
      let inside = true;
      if (radius > 0 && (lx < radius || lx > inner - radius || ly < radius || ly > inner - radius)) {
        let cx = radius, cy = radius;
        if (lx > inner - radius) cx = inner - radius;
        if (ly > inner - radius) cy = inner - radius;
        const dx = lx - cx, dy = ly - cy;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      if (!inside || lx < 0 || ly < 0 || lx > inner || ly > inner) {
        const o = y * (size * 4 + 1) + 1 + x * 4;
        raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = 0;
        continue;
      }
      // 渐变背景：左上青绿 -> 右下蓝
      const t = (lx / inner + ly / inner) / 2;
      r = Math.round(56 + t * (91 - 56));
      g = Math.round(214 + t * (140 - 214));
      b = Math.round(196 + t * (255 - 196));
      // 描画心跳波形（白色折线）
      const pts = [[0.10, 0.52], [0.24, 0.52], [0.34, 0.32], [0.47, 0.70], [0.58, 0.42], [0.68, 0.52], [0.90, 0.52]];
      const stroke = size * (maskable ? 0.022 : 0.035);
      let onLine = false;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const ax = pad + x1 * inner, ay = pad + y1 * inner, bx = pad + x2 * inner, by = pad + y2 * inner;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        let t2 = ((lx - ax) * dx + (ly - ay) * dy) / len2;
        t2 = Math.max(0, Math.min(1, t2));
        const px = ax + t2 * dx, py = ay + t2 * dy;
        if ((lx - px) ** 2 + (ly - py) ** 2 <= (stroke / 2) ** 2) { onLine = true; break; }
      }
      if (onLine) { r = 255; g = 255; b = 255; }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.join(__dirname, '..', 'www', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[[192, false], [512, false], [180, false], [1024, true]].forEach(([size, maskable]) => {
  const name = size === 180 ? 'icon-180.png' : size === 1024 ? 'icon-1024.png' : `icon-${size}.png`;
  fs.writeFileSync(path.join(outDir, name), render(size, maskable));
  console.log('generated', name, size);
});
