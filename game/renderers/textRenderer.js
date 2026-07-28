const { COLORS } = require('../design/theme');

function drawTitle(ctx, text, x, y) {
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 29px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawSubtitle(ctx, text, x, y) {
  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawLabel(ctx, text, x, y, align = 'left', options = {}) {
  ctx.fillStyle = options.color || COLORS.ink;
  ctx.font = `${options.bold ? 'bold ' : ''}${options.size || 16}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

module.exports = {
  drawTitle,
  drawSubtitle,
  drawLabel,
};
