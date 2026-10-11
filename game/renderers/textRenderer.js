const { COLORS } = require('../design/theme');

function drawTitle(ctx, text, x, y) {
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 30px "STKaiti", "KaiTi", "Microsoft YaHei", serif';
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
  // 11px floor keeps helper text legible on small phones
  ctx.font = `${options.bold ? '700 ' : '400 '}${Math.max(11, options.size || 16)}px ${options.family || '"PingFang SC", "Microsoft YaHei", sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, text, options.maxWidth), x, y);
}

function fitText(ctx, text, maxWidth) {
  const value = String(text == null ? '' : text);
  if (!maxWidth || typeof ctx.measureText !== 'function' || ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  const suffix = '…';
  let result = value;
  while (result && ctx.measureText(`${result}${suffix}`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result ? `${result}${suffix}` : suffix;
}

module.exports = {
  drawTitle,
  drawSubtitle,
  drawLabel,
  fitText,
};
