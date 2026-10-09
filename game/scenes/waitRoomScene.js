const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawPill, drawRoomCodeCard } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');
const { copyText, showToast } = require('../../utils/clipboard');
const { shareRoom } = require('../../utils/share');
const { toUserMessage } = require('../../utils/userFacingError');
const roomSession = require('../../utils/roomSession');
const { getContentTop } = require('../../utils/safeArea');

const ROOM_POLL_INTERVAL = 1200;

class WaitRoomScene {
  constructor(runtime, params) {
    this.runtime = runtime;
    this.rules=params.rules||{turnSeconds:0,allowUndo:false};
    this.roomId = params.roomId;
    this.viewId = params.viewId;
    this.role = params.role || 'host';
    this.color = params.color || (this.role === 'host' ? 'black' : 'white');
    this.error = '';
    this.watcher = null;
    this.restartTimer = null;
    this.pollTimer = null;
    this.loadInFlight = false;
    this.transitionStarted = false;
    this.active = false;
    this.leaving = false;
    this.exited = false;
    this.copying = false;
    this.copyMessage = '';
  }

  onEnter() {
    this.active = true;
    roomSession.save(this.runtime.wx, this, 'waiting');
    this.transitionStarted = false;
    this.loadRoom();
    this.startWatch();
    this.startPolling();
  }

  onResume() {
    this.active = true;
    if (this.leaving) return;
    this.transitionStarted = false;
    this.loadRoom();
    this.startWatch();
    this.startPolling();
  }

  onHide() {
    this.active = false;
    this.clearWatch();
    this.clearRestart();
    this.clearPolling();
  }

  onExit() {
    this.exited = true;
    this.active = false;
    this.clearWatch();
    this.clearRestart();
    this.clearPolling();
  }

  loadRoom() {
    if (this.loadInFlight) return Promise.resolve();
    this.loadInFlight = true;
    return this.runtime.cloud.getRoom(this.viewId)
      .then(roomData => {
        if (this.active) this.applyRoom(roomData);
      })
      .catch(err => {
        if (!this.active) return;
        this.error = toUserMessage(err, '房间同步失败');
        this.runtime.manager.render();
      })
      .finally(() => {
        this.loadInFlight = false;
      });
  }

  startWatch() {
    if (!this.active) return;
    this.clearWatch();
    this.clearRestart();
    this.watcher = this.runtime.cloud.watchRoom(
      this.viewId,
      roomData => {
        if (this.active) this.applyRoom(roomData);
      },
      () => {
        if (this.active) this.scheduleRestart();
      },
    );
  }

  applyRoom(roomData) {
    if (!this.active || this.leaving) return;
    if (!roomData) {
      roomSession.clear(this.runtime.wx, this.roomId);
      this.error = '房间已关闭';
      this.runtime.manager.render();
      return;
    }
    this.color=roomData[this.role] && roomData[this.role].color || this.color;
    roomSession.save(this.runtime.wx,this,roomData.status);
    this.rules=roomData.rules||{turnSeconds:0,allowUndo:false};

    if (roomData.status === 'playing' && !this.transitionStarted) {
      this.transitionStarted = true;
      this.runtime.manager.go('onlineGame', {
        roomId: this.roomId,
        viewId: this.viewId,
        role: this.role,
        color: this.color,
      });
      return;
    }

    this.error = '';
    this.runtime.manager.render();
  }

  startPolling() {
    this.clearPolling();
    this.schedulePoll();
  }

  schedulePoll() {
    if (!this.active || this.pollTimer) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      if (!this.active || this.transitionStarted) return;
      this.loadRoom().finally(() => this.schedulePoll());
    }, ROOM_POLL_INTERVAL);
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

  clearPolling() {
    if (!this.pollTimer) return;
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  async leave() {
    if (this.leaving || this.exited) return;
    this.leaving = true;
    this.clearWatch();
    this.clearRestart();
    this.clearPolling();
    this.runtime.manager.render();
    let failed = false;
    try {
      await this.runtime.cloud.leaveRoom(this.roomId);
      roomSession.clear(this.runtime.wx, this.roomId);
      if (!this.exited) this.runtime.manager.go('home');
    } catch (err) {
      failed = true;
      this.error = '退出未确认，请检查网络后重试';
      if (!this.exited && this.active) showToast(this.runtime.wx, this.error);
    } finally {
      this.leaving = false;
      if (failed && !this.exited && this.active) this.onResume();
    }
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
    const height = this.runtime.height - Math.max(0, (this.runtime.bottomInset || 18) - 18);
    const top = getContentTop(this.runtime.wx);
    const compact = height < 620;
    const actionY = top + (compact ? 298 : 328);
    const actionHeight = compact ? 44 : 50;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '好友房已开启', width / 2, top + 20);
    drawSubtitle(ctx, '把邀请发给好友，棋局即将开始', width / 2, top + 49);
    drawPill(ctx, {
      x: width / 2 - 67,
      y: top + 66,
      width: 134,
      text: '等待好友加入',
      fill: COLORS.goldSoft,
      color: '#79551D',
    });
    drawRoomCodeCard(ctx, {
      x: 32,
      y: top + 102,
      width: width - 64,
      roomId: this.roomId,
    });

    drawLabel(
      ctx,
      `${this.color==='black'?'你执黑 · ':'你执白 · '}${require('../../utils/matchRules').summary(this.rules)}`,
      width / 2,
      top + 254,
      'center',
      { bold: true, size: 10,maxWidth:width-60 },
    );
    if (this.error || this.copyMessage) {
      drawLabel(ctx, this.error || this.copyMessage, width / 2, top + 282, 'center', {
        size: 13,
        color: this.error ? COLORS.danger : COLORS.inkMuted,
        maxWidth: width - 72,
      });
    }

    drawButton(ctx, input, {
      x,
      y: actionY,
      width: buttonWidth,
      height: actionHeight,
      text: '邀请微信好友',
      onTap: () => this.inviteFriend(),
    });

    drawButton(ctx, input, {
      x,
      y: actionY + 58,
      width: buttonWidth,
      height: actionHeight,
      text: this.copying ? '正在复制...' : '复制房间号',
      disabled: this.copying,
      variant: 'secondary',
      onTap: () => this.copyRoomId(),
    });

    drawButton(ctx, input, {
      x,
      y: actionY + 116,
      width: buttonWidth,
      height: actionHeight,
      text: this.leaving ? '正在离开…' : '离开房间',
      disabled: this.leaving,
      variant: 'danger',
      onTap: () => this.leave(),
    });

    drawLabel(ctx, '好友从分享卡片进入时，房间号会自动填写', width / 2, height - 22, 'center', { size: 11, color: COLORS.inkMuted, maxWidth: width - 32 });
  }
}

module.exports = WaitRoomScene;
