const { COLORS, LAYOUT } = require('../design/theme');
const { roundedRectPath } = require('./cardRenderer');

const VARIANTS = {
  primary: {
    fill: COLORS.jade,
    textColor: COLORS.white,
    stroke: COLORS.jade,
  },
  secondary: {
    fill: COLORS.blueSoft,
    textColor: COLORS.blue,
    stroke: '#C8DAE7',
  },
  gold: {
    fill: COLORS.goldSoft,
    textColor: '#79551D',
    stroke: '#E7D2A8',
  },
  ghost: {
    fill: COLORS.surface,
    textColor: COLORS.inkMuted,
    stroke: COLORS.line,
  },
  danger: {
    fill: '#F5E4DF',
    textColor: COLORS.danger,
    stroke: '#E9CBC3',
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
    ctx.shadowColor = 'rgba(37, 107, 82, 0.2)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
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
  ctx.font = `bold ${fontSize}px sans-serif`;
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
