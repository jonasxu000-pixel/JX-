const { COLORS } = require('../design/theme');
const { drawCard, roundedRectPath } = require('./cardRenderer');
const { drawLabel } = require('./textRenderer');

function drawMiniBoard(ctx, x, y, size = 84, dark = false) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(216,191,140,0.28)' : '#C6B593';
  ctx.lineWidth = 1;
  const step = size / 5;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x, y + i * step); ctx.lineTo(x + size, y + i * step);
    ctx.moveTo(x + i * step, y); ctx.lineTo(x + i * step, y + size);
    ctx.stroke();
  }
  [[1,3,1],[2,2,2],[2,3,1],[3,2,2],[3,3,1],[4,3,1],[4,4,2]].forEach(([row,col,piece]) => {
    const cx = x + col * step; const cy = y + row * step;
    ctx.beginPath(); ctx.arc(cx, cy, step * 0.37, 0, Math.PI * 2);
    ctx.fillStyle = piece === 1 ? '#17231D' : '#FCF8ED';
    ctx.shadowColor = 'rgba(0,0,0,0.24)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = piece === 1 ? '#718977' : '#CEBE9D'; ctx.stroke();
  });
  ctx.beginPath(); ctx.arc(x + 3 * step, y + 4 * step, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = '#D8B56E'; ctx.fill();
  ctx.restore();
}

function drawModeCard(ctx, input, options) {
  const { x, y, width, height, title, subtitle, tag, onTap, dark = false } = options;
  const pressed = input.isPressed(options);
  drawCard(ctx, { x, y: y + (pressed ? 1 : 0), width, height, fill: dark ? COLORS.jade : COLORS.surface, stroke: dark ? '#345343' : COLORS.line, radius: 18 });
  const color = dark ? '#FFF9EA' : COLORS.ink;
  drawLabel(ctx, title, x + 20, y + height * 0.36, 'left', { bold: true, size: 19, color, maxWidth: width - 92 });
  drawLabel(ctx, subtitle, x + 20, y + height * 0.7, 'left', { size: 11, color: dark ? '#BECEBC' : COLORS.inkMuted, maxWidth: width - 72 });
  if (tag) drawLabel(ctx, tag, x + width - 20, y + height * 0.36, 'right', { bold: true, size: 12, color: dark ? '#D8B56E' : COLORS.gold });
  drawLabel(ctx, '→', x + width - 24, y + height * 0.7, 'right', { size: 20, color: dark ? '#D8B56E' : COLORS.jade });
  input.addHitArea({ x, y, width, height }, onTap);
}

function drawProgressBar(ctx, x, y, width, ratio, dark = false) {
  ctx.save();
  roundedRectPath(ctx, x, y, width, 5, 3);
  ctx.fillStyle = dark ? '#41604D' : '#E2E8E0'; ctx.fill();
  if (ratio > 0) {
    roundedRectPath(ctx, x, y, Math.max(5, width * Math.min(1, ratio)), 5, 3);
    ctx.fillStyle = dark ? '#D8B56E' : COLORS.jade; ctx.fill();
  }
  ctx.restore();
}

function drawPageHeader(ctx, width, top, title, subtitle) {
  drawLabel(ctx, '棋遇 / 练棋手记', 20, top + 8, 'left', { size: 11, color: COLORS.gold, bold: true });
  drawLabel(ctx, title, 20, top + 39, 'left', { size: 27, bold: true, maxWidth: width - 40 });
  drawLabel(ctx, subtitle, 20, top + 69, 'left', { size: 12, color: COLORS.inkMuted, maxWidth: width - 40 });
}

module.exports = { drawMiniBoard, drawModeCard, drawProgressBar, drawPageHeader };
