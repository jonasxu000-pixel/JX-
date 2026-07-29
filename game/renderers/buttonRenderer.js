const { COLORS, LAYOUT } = require('../design/theme');
const { roundedRectPath } = require('./cardRenderer');

const VARIANTS = {
  primary: {
    fill: COLORS.jade,
    textColor: COLORS.white,
    stroke: COLORS.jade,
  },
  secondary: {
    fill: COLORS.surface,
    textColor: COLORS.jade,
    stroke: '#7C9A8D',
  },
  gold: {
    fill: COLORS.surfaceMuted,
    textColor: COLORS.inkMuted,
    stroke: COLORS.line,
  },
  ghost: {
    fill: COLORS.surface,
    textColor: COLORS.inkMuted,
    stroke: COLORS.line,
  },
  danger: {
    fill: COLORS.dangerSoft,
    textColor: COLORS.danger,
    stroke: '#E4C0C0',
  },
};

function drawButton(ctx, input, options) {
  const {
    x,
    y,
    width,
    height,
    text,
    onTap,
    disabled,
    variant = 'primary',
    fill,
    textColor,
    stroke,
    fontSize = 16,
  } = options;
  const style = VARIANTS[variant] || VARIANTS.primary;
  const resolvedFill = fill || style.fill;
  const resolvedText = textColor || style.textColor;
  const resolvedStroke = stroke || style.stroke;
  const radius = Math.min(LAYOUT.buttonRadius, height / 2);
  const rect = { x, y, width, height };
  const pressed = !disabled && input.isPressed(rect);
  const drawY = y + (pressed ? 1 : 0);

  ctx.save();
  ctx.globalAlpha = disabled ? 0.48 : (pressed ? 0.84 : 1);
  if (!disabled && !pressed && variant === 'primary') {
    ctx.shadowColor = 'rgba(20, 56, 43, 0.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
  }
  roundedRectPath(ctx, x, drawY, width, height, radius);
  ctx.fillStyle = resolvedFill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (resolvedStroke) {
    ctx.strokeStyle = resolvedStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = resolvedText;
  ctx.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width / 2, drawY + height / 2);
  ctx.restore();

  input.addHitArea(rect, onTap, disabled);
}

module.exports = {
  drawButton,
  VARIANTS,
};
