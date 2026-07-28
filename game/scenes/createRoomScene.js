const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { copyText, showToast } = require('../../utils/clipboard');

class CreateRoomScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.roomId = '';
    this.loading = false;
    this.error = '';
    this.copying = false;
    this.copyMessage = '';
    this.slowResponse = false;
    this.slowTimer = null;
  }

  onEnter() {
    this.createRoom();
  }

  onExit() {
    this.clearSlowTimer();
  }

  createRoom() {
    if (this.loading || this.roomId) return;
    this.loading = true;
    this.error = '';
    this.slowResponse = false;
    this.clearSlowTimer();
    this.slowTimer = setTimeout(() => {
      this.slowTimer = null;
      if (!this.loading) return;
      this.slowResponse = true;
      this.runtime.manager.render();
    }, 800);
    this.runtime.manager.render();

    this.runtime.cloud.createRoom()
      .then(roomId => {
        this.roomId = roomId;
      })
      .catch(err => {
        this.error = err.message || '创建房间失败';
      })
      .finally(() => {
        this.clearSlowTimer();
        this.loading = false;
        this.runtime.manager.render();
      });
  }

  clearSlowTimer() {
    if (!this.slowTimer) return;
    clearTimeout(this.slowTimer);
    this.slowTimer = null;
  }

  copyRoomId() {
    if (!this.roomId || this.copying) return;
    this.copying = true;
    this.copyMessage = '正在复制房间号...';
    this.runtime.manager.render();

    copyText(this.runtime.wx, this.roomId)
      .then(() => {
        this.copyMessage = `房间号 ${this.roomId} 已复制`;
        showToast(this.runtime.wx, '房间号已复制', 'success');
      })
      .catch(() => {
        this.copyMessage = '复制失败，请重新点击';
        showToast(this.runtime.wx, '复制失败，请重试');
      })
      .finally(() => {
        this.copying = false;
        this.runtime.manager.render();
      });
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '创建房间', width / 2, 86);
    drawSubtitle(
      ctx,
      this.loading
        ? (this.slowResponse ? '云端正在响应，请稍候...' : '正在创建房间...')
        : '把房间号发给另一台手机',
      width / 2,
      126,
    );

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 164, width - 80, 120);
    ctx.fillStyle = '#22342d';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.roomId || (this.loading ? '创建中…' : '------'), width / 2, 224);

    if (this.error || this.copyMessage) {
      drawLabel(ctx, this.error || this.copyMessage, width / 2, 312, 'center');
    }

    drawButton(ctx, input, {
      x,
      y: 340,
      width: buttonWidth,
      height: 50,
      text: this.copying ? '正在复制...' : '复制房间号',
      disabled: !this.roomId || this.copying,
      fill: '#295f92',
      onTap: () => this.copyRoomId(),
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
