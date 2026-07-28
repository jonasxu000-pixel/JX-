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

    drawTitle(ctx, '双人五子棋', width / 2, 105);
    drawSubtitle(ctx, '微信小游戏版 · Canvas 对战', width / 2, 145);

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
  }
}

module.exports = HomeScene;
