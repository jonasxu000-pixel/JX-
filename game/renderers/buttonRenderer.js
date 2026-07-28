function drawButton(ctx, input, options) {
  const {
    x,
    y,
    width,
    height,
    text,
    onTap,
    disabled,
    fill = '#2f7d5c',
    textColor = '#ffffff',
  } = options;
  const radius = Math.min(18, height / 2);

  ctx.save();
  ctx.globalAlpha = disabled ? 0.48 : 1;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width / 2, y + height / 2);
  ctx.restore();

  input.addHitArea({ x, y, width, height }, onTap, disabled);
}

module.exports = {
  drawButton,
};
