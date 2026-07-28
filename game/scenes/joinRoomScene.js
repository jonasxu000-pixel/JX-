const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');

class JoinRoomScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.roomId = '';
    this.loading = false;
    this.error = '';
    this.active = true;
  }

  onEnter() {
    this.active = true;
  }

  onExit() {
    this.active = false;
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '加入房间', width / 2, 70);
    drawSubtitle(ctx, '输入 6 位房间号', width / 2, 106);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 132, width - 80, 74);
    ctx.fillStyle = '#22342d';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.roomId.padEnd(6, '·'), width / 2, 169);

    this.renderKeypad(ctx, input);

    if (this.error) {
      drawLabel(ctx, this.error, width / 2, 430, 'center');
    }

    drawButton(ctx, input, {
      x,
      y: 458,
      width: buttonWidth,
      height: 50,
      text: this.loading ? '加入中...' : '加入房间',
      disabled: this.loading || this.roomId.length !== 6,
      onTap: () => this.joinRoom(),
    });

    drawButton(ctx, input, {
      x,
      y: 522,
      width: buttonWidth,
      height: 50,
      text: '返回首页',
      fill: '#777777',
      onTap: () => manager.go('home'),
    });
  }

  renderKeypad(ctx, input) {
    const { width } = this.runtime;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '退格', '0', '清空'];
    const keyWidth = Math.min(86, (width - 72) / 3);
    const gap = 12;
    const startX = (width - keyWidth * 3 - gap * 2) / 2;
    const startY = 232;

    keys.forEach((key, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      drawButton(ctx, input, {
        x: startX + col * (keyWidth + gap),
        y: startY + row * 48,
        width: keyWidth,
        height: 38,
        text: key,
        fill: /^[0-9]$/.test(key) ? '#e0b564' : '#888888',
        onTap: () => this.handleKey(key),
      });
    });
  }

  handleKey(key) {
    this.error = '';
    if (/^[0-9]$/.test(key) && this.roomId.length < 6) {
      this.roomId += key;
    } else if (key === '退格') {
      this.roomId = this.roomId.slice(0, -1);
    } else if (key === '清空') {
      this.roomId = '';
    }
    this.runtime.manager.render();
  }

  joinRoom() {
    if (this.loading || this.roomId.length !== 6) return;
    this.loading = true;
    this.error = '';
    this.runtime.manager.render();

    this.runtime.cloud.joinRoom(this.roomId)
      .then(result => {
        if (!this.active) return;
        this.runtime.manager.go('waitRoom', {
          roomId: this.roomId,
          role: result.role,
          color: result.color,
        });
      })
      .catch(err => {
        if (!this.active) return;
        this.error = err.message || '加入失败';
      })
      .finally(() => {
        if (!this.active) return;
        this.loading = false;
        this.runtime.manager.render();
      });
  }
}

module.exports = JoinRoomScene;
