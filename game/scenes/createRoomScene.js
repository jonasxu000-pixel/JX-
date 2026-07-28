const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');

class CreateRoomScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.roomId = '';
    this.loading = false;
    this.error = '';
  }

  onEnter() {
    this.createRoom();
  }

  createRoom() {
    if (this.loading || this.roomId) return;
    this.loading = true;
    this.error = '';
    this.runtime.manager.render();

    this.runtime.cloud.createRoom()
      .then(roomId => {
        this.roomId = roomId;
      })
      .catch(err => {
        this.error = err.message || '创建房间失败';
      })
      .finally(() => {
        this.loading = false;
        this.runtime.manager.render();
      });
  }

  render(ctx, input) {
    const { width, manager, wx } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '创建房间', width / 2, 86);
    drawSubtitle(ctx, this.loading ? '正在创建房间...' : '把房间号发给另一台手机', width / 2, 126);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 164, width - 80, 120);
    ctx.fillStyle = '#22342d';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.roomId || '------', width / 2, 224);

    if (this.error) {
      drawLabel(ctx, this.error, width / 2, 312, 'center');
    }

    drawButton(ctx, input, {
      x,
      y: 340,
      width: buttonWidth,
      height: 50,
      text: '复制房间号',
      disabled: !this.roomId,
      fill: '#295f92',
      onTap: () => {
        if (wx.setClipboardData) wx.setClipboardData({ data: this.roomId });
      },
    });

    drawButton(ctx, input, {
      x,
      y: 406,
      width: buttonWidth,
      height: 50,
      text: '进入等待',
      disabled: !this.roomId,
      onTap: () => manager.go('waitRoom', {
        roomId: this.roomId,
        role: 'host',
        color: 'black',
      }),
    });

    drawButton(ctx, input, {
      x,
      y: 472,
      width: buttonWidth,
      height: 50,
      text: '返回首页',
      fill: '#777777',
      onTap: () => manager.go('home'),
    });
  }
}

module.exports = CreateRoomScene;
