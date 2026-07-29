const { COLORS } = require('../design/theme');

function drawTitle(ctx, text, x, y) {
  ctx.fillStyle = COLORS.ink;
  ctx.font = '800 32px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawSubtitle(ctx, text, x, y) {
  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawLabel(ctx, text, x, y, align = 'left', options = {}) {
  ctx.fillStyle = options.color || COLORS.ink;
  ctx.font = `${options.bold ? '700 ' : '400 '}${options.size || 16}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

module.exports = {
  drawTitle,
  drawSubtitle,
  drawLabel,
};
