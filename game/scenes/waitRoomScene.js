const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');

class WaitRoomScene {
  constructor(runtime, params) {
    this.runtime = runtime;
    this.roomId = params.roomId;
    this.role = params.role || 'host';
    this.color = params.color || (this.role === 'host' ? 'black' : 'white');
    this.error = '';
    this.watcher = null;
    this.restartTimer = null;
    this.active = false;
  }

  onEnter() {
    this.active = true;
    this.loadRoom();
    this.startWatch();
  }

  onResume() {
    this.active = true;
    this.loadRoom();
    this.startWatch();
  }

  onExit() {
    this.active = false;
    this.clearWatch();
    this.clearRestart();
  }

  loadRoom() {
    this.runtime.cloud.getRoom(this.roomId)
      .then(roomData => {
        if (this.active) this.applyRoom(roomData);
      })
      .catch(err => {
        if (!this.active) return;
        this.error = err.message || '房间同步失败';
        this.runtime.manager.render();
      });
  }

  startWatch() {
    if (!this.active) return;
    this.clearWatch();
    this.clearRestart();
    this.watcher = this.runtime.cloud.watchRoom(
      this.roomId,
      roomData => {
        if (this.active) this.applyRoom(roomData);
      },
      () => {
        if (this.active) this.scheduleRestart();
      },
    );
  }

  applyRoom(roomData) {
    if (!this.active) return;
    if (!roomData) {
      this.error = '房间已关闭';
      this.runtime.manager.render();
      return;
    }

    if (roomData.status === 'playing') {
      this.runtime.manager.go('onlineGame', {
        roomId: this.roomId,
        role: this.role,
        color: this.color,
      });
      return;
    }

    this.error = '';
    this.runtime.manager.render();
  }

  scheduleRestart() {
    if (!this.active || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.active) return;
      this.loadRoom();
      this.startWatch();
    }, 1000);
  }

  clearWatch() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  }

  clearRestart() {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  leave() {
    this.active = false;
    this.clearWatch();
    this.clearRestart();
    this.runtime.cloud.leaveRoom(this.roomId)
      .finally(() => this.runtime.manager.go('home'));
  }

  render(ctx, input) {
    const { width, wx } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '等待对手', width / 2, 86);
    drawSubtitle(ctx, '让另一台手机输入房间号', width / 2, 126);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 166, width - 80, 112);
    ctx.fillStyle = '#22342d';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.roomId || '------', width / 2, 222);

    drawLabel(ctx, this.role === 'host' ? '你执黑，先手' : '你执白，后手', width / 2, 314, 'center');
    if (this.error) drawLabel(ctx, this.error, width / 2, 350, 'center');

    drawButton(ctx, input, {
      x,
      y: 386,
      width: buttonWidth,
      height: 50,
      text: '复制房间号',
      fill: '#295f92',
      onTap: () => {
        if (wx.setClipboardData) wx.setClipboardData({ data: this.roomId });
      },
    });

    drawButton(ctx, input, {
      x,
      y: 452,
      width: buttonWidth,
      height: 50,
      text: '离开房间',
      fill: '#777777',
      onTap: () => this.leave(),
    });
  }
}

module.exports = WaitRoomScene;
