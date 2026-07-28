const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawPill, drawRoomCodeCard } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');
const { copyText, showToast } = require('../../utils/clipboard');
const { shareRoom } = require('../../utils/share');

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

  inviteFriend() {
    if (!this.roomId) return;
    try {
      shareRoom(this.runtime.wx, this.roomId);
      showToast(this.runtime.wx, '请选择好友发送邀请', 'none');
    } catch (err) {
      this.copyMessage = '暂时无法唤起分享，已为你复制房间号';
      this.copyRoomId();
    }
    this.runtime.manager.go('waitRoom', {
      roomId: this.roomId,
      role: 'host',
      color: 'black',
    });
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '创建好友房', width / 2, 58);
    drawSubtitle(
      ctx,
      this.loading
        ? (this.slowResponse ? '云端正在响应，请稍候...' : '正在创建房间...')
        : '房间已准备好，邀请好友开局',
      width / 2,
      92,
    );

    if (this.loading) {
      drawPill(ctx, {
        x: width / 2 - 62,
        y: 112,
        width: 124,
        text: this.slowResponse ? '云端连接中' : '正在创建',
        fill: COLORS.blueSoft,
        color: COLORS.blue,
      });
    }
    drawRoomCodeCard(ctx, {
      x: 32,
      y: 150,
      width: width - 64,
      roomId: this.roomId,
    });

    if (this.error || this.copyMessage) {
      drawLabel(ctx, this.error || this.copyMessage, width / 2, 298, 'center', {
        size: 14,
        color: this.error ? COLORS.danger : COLORS.inkMuted,
      });
    }

    drawButton(ctx, input, {
      x,
      y: 326,
      width: buttonWidth,
      height: 50,
      text: '邀请微信好友',
      disabled: !this.roomId,
      onTap: () => this.inviteFriend(),
    });

    drawButton(ctx, input, {
      x,
      y: 390,
      width: buttonWidth,
      height: 50,
      text: this.copying ? '正在复制...' : '复制房间号',
      disabled: !this.roomId || this.copying,
      variant: 'secondary',
      onTap: () => this.copyRoomId(),
    });

    drawButton(ctx, input, {
      x,
      y: 454,
      width: buttonWidth,
      height: 50,
      text: '进入房间等待',
      disabled: !this.roomId,
      variant: 'gold',
      onTap: () => manager.go('waitRoom', {
        roomId: this.roomId,
        role: 'host',
        color: 'black',
      }),
    });

    drawButton(ctx, input, {
      x,
      y: 518,
      width: buttonWidth,
      height: 48,
      text: '返回首页',
      variant: 'ghost',
      onTap: () => manager.go('home'),
    });

    drawSubtitle(ctx, '好友点击分享卡片后，房间号会自动带入', width / 2, 598);
  }
}

module.exports = CreateRoomScene;
