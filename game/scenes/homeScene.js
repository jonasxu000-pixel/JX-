const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle } = require('../renderers/textRenderer');

class HomeScene {
  constructor(runtime) {
    this.runtime = runtime;
  }

  render(ctx, input) {
    const { width, height, manager } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;
    const startY = Math.max(210, height * 0.32);

    drawBrandStones(ctx, width / 2, 66);
    drawTitle(ctx, '你棋没我硬', width / 2, 112);
    drawSubtitle(ctx, '好友联机五子棋 · 落子见真章', width / 2, 150);

    drawButton(ctx, input, {
      x,
      y: startY,
      width: buttonWidth,
      height: 52,
      text: '本机对战',
      onTap: () => manager.go('localGame'),
    });

    drawButton(ctx, input, {
      x,
      y: startY + 72,
      width: buttonWidth,
      height: 52,
      text: '创建房间',
      fill: '#295f92',
      onTap: () => manager.go('createRoom'),
    });

    drawButton(ctx, input, {
      x,
      y: startY + 144,
      width: buttonWidth,
      height: 52,
      text: '加入房间',
      fill: '#8b5a2b',
      onTap: () => manager.go('joinRoom'),
    });

    drawSubtitle(ctx, '房间号即开即用 · 对局实时同步', width / 2, startY + 220);
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
