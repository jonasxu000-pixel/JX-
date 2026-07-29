const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');

class CreateRoomScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.loading = false;
    this.error = '';
    this.slowResponse = false;
    this.slowTimer = null;
    this.active = false;
  }

  onEnter() {
    this.active = true;
    this.createRoom();
  }

  onExit() {
    this.active = false;
    this.clearSlowTimer();
  }

  createRoom() {
    if (this.loading) return;
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
        if (!this.active) {
          this.cleanupAbandonedRoom(roomId);
          return;
        }
        this.runtime.manager.go('waitRoom', {
          roomId,
          role: 'host',
          color: 'black',
        });
      })
      .catch(err => {
        if (!this.active) return;
        this.error = err.message || '创建房间失败';
      })
      .finally(() => {
        this.clearSlowTimer();
        this.loading = false;
        if (this.active) this.runtime.manager.render();
      });
  }

  cleanupAbandonedRoom(roomId) {
    if (!roomId || !this.runtime.cloud || !this.runtime.cloud.leaveRoom) return;
    this.runtime.cloud.leaveRoom(roomId).catch(() => {});
  }

  clearSlowTimer() {
    if (!this.slowTimer) return;
    clearTimeout(this.slowTimer);
    this.slowTimer = null;
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '创建好友房', width / 2, 58);
    drawSubtitle(
      ctx,
      this.error
        ? '没有创建成功，可以立即重试'
        : (this.slowResponse ? '云端正在响应，请稍候…' : '创建完成后将自动进入房间'),
      width / 2,
      92,
    );

    drawCard(ctx, {
      x: 32,
      y: 150,
      width: width - 64,
      height: 196,
      fill: this.error ? COLORS.dangerSoft : COLORS.surface,
    });
    drawPill(ctx, {
      x: width / 2 - 62,
      y: 174,
      width: 124,
      height: 30,
      text: this.error ? '创建未完成' : (this.slowResponse ? '云端连接中' : '正在创建'),
      fill: this.error ? '#F8DEDE' : COLORS.jadeSoft,
      color: this.error ? COLORS.danger : COLORS.jade,
    });
    drawRoomPulse(ctx, width / 2, 238, Boolean(this.error));
    drawLabel(
      ctx,
      this.error ? this.error : '正在为你准备一间好友房',
      width / 2,
      292,
      'center',
      {
        bold: true,
        size: 16,
        color: this.error ? COLORS.danger : COLORS.ink,
      },
    );
    drawLabel(
      ctx,
      this.error ? '检查网络后重新创建，不会产生重复房间' : '成功后你会直接在房间内等待好友',
      width / 2,
      320,
      'center',
      {
        size: 14,
        color: this.error ? COLORS.danger : COLORS.inkMuted,
      },
    );

    if (this.error) {
      drawButton(ctx, input, {
        x,
        y: 382,
        width: buttonWidth,
        height: 52,
        text: '重新创建',
        onTap: () => this.createRoom(),
      });
    }

    drawButton(ctx, input, {
      x,
      y: this.error ? 450 : 382,
      width: buttonWidth,
      height: 48,
      text: '返回首页',
      variant: 'ghost',
      onTap: () => manager.go('home'),
    });

    drawSubtitle(ctx, '进入房间后即可邀请好友或复制房间号', width / 2, this.error ? 526 : 458);
  }
}

function drawRoomPulse(ctx, x, y, failed) {
  ctx.save();
  const colors = failed
    ? [COLORS.danger, '#D58A8A', '#E8BABA']
    : [COLORS.jade, COLORS.gold, '#8EAB9D'];
  [-30, 0, 30].forEach((offset, index) => {
    ctx.beginPath();
    ctx.arc(x + offset, y, index === 1 ? 11 : 8, 0, Math.PI * 2);
    ctx.fillStyle = colors[index];
    ctx.globalAlpha = index === 1 ? 1 : 0.72;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x - 20, y);
  ctx.lineTo(x - 10, y);
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + 20, y);
  ctx.strokeStyle = failed ? '#D9A0A0' : '#B5C7BE';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

module.exports = CreateRoomScene;
