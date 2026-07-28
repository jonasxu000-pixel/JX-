const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');

class HomeScene {
  constructor(runtime) {
    this.runtime = runtime;
  }

  render(ctx, input) {
    const { width, height, manager } = this.runtime;
    const buttonWidth = Math.min(width - 56, 300);
    const x = (width - buttonWidth) / 2;
    const startY = Math.max(300, height * 0.43);

    drawCard(ctx, {
      x: 20,
      y: 34,
      width: width - 40,
      height: 226,
      fill: COLORS.surface,
    });
    drawBrandStones(ctx, width / 2, 84);
    drawTitle(ctx, '你棋没我硬', width / 2, 132);
    drawSubtitle(ctx, '好友联机五子棋 · 落子见真章', width / 2, 166);
    drawPill(ctx, {
      x: width / 2 - 108,
      y: 196,
      width: 100,
      text: '好友实时联机',
    });
    drawPill(ctx, {
      x: width / 2 + 8,
      y: 196,
      width: 100,
      text: '无需注册',
      fill: COLORS.goldSoft,
      color: '#79551D',
    });

    drawButton(ctx, input, {
      x,
      y: startY,
      width: buttonWidth,
      height: 52,
      text: '本机双人对战',
      variant: 'gold',
      onTap: () => manager.go('localGame'),
    });

    drawButton(ctx, input, {
      x,
      y: startY + 72,
      width: buttonWidth,
      height: 52,
      text: '创建好友房',
      onTap: () => manager.go('createRoom'),
    });

    drawButton(ctx, input, {
      x,
      y: startY + 144,
      width: buttonWidth,
      height: 52,
      text: '加入好友房',
      variant: 'secondary',
      onTap: () => manager.go('joinRoom'),
    });

    drawSubtitle(ctx, '创建房间 · 邀请好友 · 随时开局', width / 2, startY + 220);
  }
}

function drawBrandStones(ctx, centerX, centerY) {
  const stones = [
    { x: centerX - 15, fill: '#1d2321', stroke: '#0c0f0e' },
    { x: centerX + 15, fill: '#f8f8f5', stroke: '#c7cdc9' },
  ];

  stones.forEach(stone => {
    ctx.beginPath();
    ctx.arc(stone.x, centerY, 10, 0, Math.PI * 2);
    ctx.fillStyle = stone.fill;
    ctx.fill();
    ctx.strokeStyle = stone.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

module.exports = HomeScene;
