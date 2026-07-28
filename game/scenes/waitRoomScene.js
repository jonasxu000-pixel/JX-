const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawPill, drawRoomCodeCard } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');
const { copyText, showToast } = require('../../utils/clipboard');
const { shareRoom } = require('../../utils/share');

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
    this.copying = false;
    this.copyMessage = '';
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

  inviteFriend() {
    try {
      shareRoom(this.runtime.wx, this.roomId);
      this.copyMessage = '已打开好友列表，选择好友即可发送';
      showToast(this.runtime.wx, '请选择好友发送邀请');
    } catch (err) {
      this.copyMessage = '暂时无法唤起分享，可复制房间号邀请';
      showToast(this.runtime.wx, '暂时无法直接邀请');
    }
    this.runtime.manager.render();
  }

  render(ctx, input) {
    const { width } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '好友房已开启', width / 2, 58);
    drawSubtitle(ctx, '把邀请发给好友，棋局即将开始', width / 2, 92);
    drawPill(ctx, {
      x: width / 2 - 67,
      y: 112,
      width: 134,
      text: '等待好友加入',
      fill: COLORS.goldSoft,
      color: '#79551D',
    });
    drawRoomCodeCard(ctx, {
      x: 32,
      y: 154,
      width: width - 64,
      roomId: this.roomId,
    });

    drawLabel(
      ctx,
      this.role === 'host' ? '你的棋子：黑棋 · 先手' : '你的棋子：白棋 · 后手',
      width / 2,
      304,
      'center',
      { bold: true, size: 14 },
    );
    if (this.error || this.copyMessage) {
      drawLabel(ctx, this.error || this.copyMessage, width / 2, 334, 'center', {
        size: 13,
        color: this.error ? COLORS.danger : COLORS.inkMuted,
      });
    }

    drawButton(ctx, input, {
      x,
      y: 366,
      width: buttonWidth,
      height: 50,
      text: '邀请微信好友',
      onTap: () => this.inviteFriend(),
    });

    drawButton(ctx, input, {
      x,
      y: 430,
      width: buttonWidth,
      height: 50,
      text: this.copying ? '正在复制...' : '复制房间号',
      disabled: this.copying,
      variant: 'secondary',
      onTap: () => this.copyRoomId(),
    });

    drawButton(ctx, input, {
      x,
      y: 494,
      width: buttonWidth,
      height: 50,
      text: '离开房间',
      variant: 'danger',
      onTap: () => this.leave(),
    });

    drawSubtitle(ctx, '好友从分享卡片进入时，房间号会自动填写', width / 2, 580);
  }
}

module.exports = WaitRoomScene;
