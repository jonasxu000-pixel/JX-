const { drawCard } = require('./cardRenderer');
const { drawLabel } = require('./textRenderer');
const { drawButton } = require('./buttonRenderer');
const rules = require('../../utils/matchRules');
function drawClock(ctx, rect, title, deadline, now = Date.now(), options = null) {
  const seconds = rules.secondsLeft(deadline, now);
  const urgent = seconds !== null && seconds <= 10;
  drawCard(ctx, {
    ...rect,
    radius: Math.min(15, rect.height / 2),
    fill: urgent ? '#FBE7D8' : '#E7EEE2',
    stroke: urgent ? '#E2B79B' : '#B9C8B0',
    shadow: false,
  });
  // stone chip shows the side to move, supplied by the scene's own turn state
  const side = options && (options.side === 'black' || options.side === 'white') ? options.side : null;
  let textX = rect.x + 14;
  if (side) {
    const cx = rect.x + 20;
    const cy = rect.y + rect.height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = side === 'black' ? '#1F1F1F' : '#FBFBF7';
    ctx.fill();
    ctx.strokeStyle = side === 'black' ? '#000000' : '#A9A99F';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    textX = rect.x + 36;
  }
  const titleWidth = rect.width - (textX - rect.x) - 70;
  if (title && titleWidth > 0) drawLabel(ctx, title, textX, rect.y + rect.height / 2, 'left', {
    size: 13,
    bold: true,
    color: urgent ? '#8A3A22' : '#3F5A43',
    maxWidth: titleWidth,
  });
  drawLabel(
    ctx,
    rules.format(seconds),
    rect.x + rect.width - 14,
    rect.y + rect.height / 2,
    'right',
    { size: 17, bold: true, color: urgent ? '#A83232' : '#14382B' },
  );
}
function drawUndoPrompt(ctx, input, runtime, options) {
  const { width, height } = runtime;
  const y = Math.max(110, (height - 220) / 2);
  input.beginFrame();
  ctx.fillStyle = 'rgba(26,45,32,.42)';
  ctx.fillRect(0, 0, width, height);
  input.addHitArea({ x: 20, y, width: width - 40, height: 220 }, () => {});
  drawCard(ctx, {
    x: 20,
    y,
    width: width - 40,
    height: 220,
    fill: '#FAF2E1',
    stroke: '#CBB38A',
    radius: 22,
  });
  ctx.fillStyle = '#B3833E';
  ctx.fillRect(40, y + 20, 4, 30);
  drawLabel(ctx, options.title, 54, y + 35, 'left', { bold: true, size: 20, maxWidth: width - 94 });
  drawLabel(ctx, options.note, 40, y + 78, 'left', {
    size: 14,
    color: '#5F503A',
    maxWidth: width - 80,
  });
  ctx.strokeStyle = '#E4D7BC';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, y + 99);
  ctx.lineTo(width - 40, y + 99);
  ctx.stroke();
  drawLabel(ctx, options.detail, 40, y + 120, 'left', {
    size: 12,
    color: '#7A653F',
    maxWidth: width - 80,
  });
  const half = (width - 92) / 2;
  drawButton(ctx, input, {
    x: 40,
    y: y + 154,
    width: half,
    height: 44,
    text: options.rejectText || '拒绝',
    variant: 'gold',
    disabled: options.disabled,
    onTap: options.onReject,
  });
  if (options.onAccept)
    drawButton(ctx, input, {
      x: 52 + half,
      y: y + 154,
      width: half,
      height: 44,
      text: '同意悔棋',
      disabled: options.disabled,
      onTap: options.onAccept,
    });
}
module.exports = { drawClock, drawUndoPrompt };
