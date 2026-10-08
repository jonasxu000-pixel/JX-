const { drawCard } = require('./cardRenderer');
const { drawLabel } = require('./textRenderer');
const { drawButton } = require('./buttonRenderer');
const rules = require('../../utils/matchRules');
function drawClock(ctx, rect, title, deadline, now = Date.now()) {
  const seconds = rules.secondsLeft(deadline, now);
  drawCard(ctx, {
    ...rect,
    radius: 13,
    fill: seconds !== null && seconds <= 10 ? '#FBE7D8' : '#E7EEE2',
    stroke: '#C6D0B9',
    shadow: false,
  });
  drawLabel(ctx, title, rect.x + 12, rect.y + rect.height / 2, 'left', {
    size: 11,
    color: '#52664D',
    maxWidth: rect.width - 78,
  });
  drawLabel(
    ctx,
    rules.format(seconds),
    rect.x + rect.width - 12,
    rect.y + rect.height / 2,
    'right',
    { size: 16, bold: true, color: seconds !== null && seconds <= 10 ? '#A83232' : '#214E42' },
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
  drawLabel(ctx, options.title, 40, y + 35, 'left', { bold: true, size: 21, maxWidth: width - 80 });
  drawLabel(ctx, options.note, 40, y + 76, 'left', {
    size: 12,
    color: '#7A694E',
    maxWidth: width - 80,
  });
  drawLabel(ctx, options.detail, 40, y + 104, 'left', {
    size: 11,
    color: '#917953',
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
