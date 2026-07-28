const { COLORS, LAYOUT } = require('../design/theme');

function roundedRectPath(ctx, x, y, width, height, radius = LAYOUT.cardRadius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawCard(ctx, options) {
  const {
    x,
    y,
    width,
    height,
    radius = LAYOUT.cardRadius,
    fill = COLORS.surface,
    stroke = COLORS.line,
    shadow = true,
  } = options;

  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(31, 43, 39, 0.09)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPill(ctx, options) {
  const {
    x,
    y,
    width,
    height = 28,
    text,
    fill = COLORS.jadeSoft,
    color = COLORS.jade,
  } = options;

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width / 2, y + height / 2);
  ctx.restore();
}

function drawRoomCodeCard(ctx, options) {
  const { x, y, width, roomId, eyebrow = '好友房间号' } = options;
  drawCard(ctx, {
    x,
    y,
    width,
    height: 126,
    fill: COLORS.surface,
  });

  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(eyebrow, x + width / 2, y + 28);

  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(roomId || '······', x + width / 2, y + 72);

  ctx.fillStyle = COLORS.gold;
  for (let index = 0; index < 6; index += 1) {
    ctx.beginPath();
    ctx.arc(x + width / 2 - 35 + index * 14, y + 105, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAppBackground(ctx, width, height) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = COLORS.jadeSoft;
  ctx.beginPath();
  ctx.arc(width + 16, 28, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.goldSoft;
  ctx.beginPath();
  ctx.arc(-18, height - 10, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

module.exports = {
  drawAppBackground,
  drawCard,
  drawPill,
  drawRoomCodeCard,
  roundedRectPath,
};
