const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');
const {
  getStoredPlayer,
  normalizeWechatUserInfo,
  savePlayer,
} = require('../../utils/playerSession');
const { showToast } = require('../../utils/clipboard');
const { drawAvatar } = require('../renderers/avatarRenderer');
const { getContentTop } = require('../../utils/safeArea');
const { toUserMessage } = require('../../utils/userFacingError');
const progressStore = require('../../utils/progressStore');
const localMatchStore = require('../../utils/localMatchStore');
const roomSession = require('../../utils/roomSession');
const { drawMiniBoard, drawModeCard, drawProgressBar } = require('../renderers/practiceRenderer');

class HomeScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.player = getStoredPlayer(runtime.wx);
    this.loginLoading = false;
    this.userInfoButton = null;
    this.active = false;
  }

  onEnter() {
    this.active = true;
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatLoginButton();
  }

  onResume() {
    this.active = true;
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatLoginButton();
  }

  onHide() {
    this.active = false;
    this.destroyWeChatLoginButton();
  }

  onExit() {
    this.active = false;
    this.destroyWeChatLoginButton();
  }

  loginWithWeChat(userInfo = {}) {
    if (this.loginLoading) return;
    this.loginLoading = true;
    this.runtime.manager.render();
    this.runtime.cloud.login()
      .then(openId => {
        const profile = normalizeWechatUserInfo(userInfo);
        this.player = savePlayer(this.runtime.wx, openId, userInfo, this.player);
        if (!this.active) return;
        this.destroyWeChatLoginButton();
        if (profile.usable) {
          showToast(this.runtime.wx, '微信账号登录成功', 'success');
        } else {
          showToast(this.runtime.wx, '身份已连接，请完善头像昵称');
          this.runtime.manager.go('profile');
        }
      })
      .catch(err => {
        if (this.active) showToast(this.runtime.wx, toUserMessage(err, '微信登录失败'));
      })
      .finally(() => {
        this.loginLoading = false;
        if (this.active) this.runtime.manager.render();
      });
  }

  createWeChatLoginButton() {
    const wxApi = this.runtime.wx;
    if (this.player
      || this.userInfoButton
      || !wxApi
      || typeof wxApi.createUserInfoButton !== 'function') return;
    const { width } = this.runtime;
    const layout = this.getLayout();
    this.userInfoButton = wxApi.createUserInfoButton({
      type: 'text',
      text: '微信快捷登录',
      withCredentials: false,
      lang: 'zh_CN',
      style: {
        left: width - 160,
        top: layout.playerY + 2,
        width: 140,
        height: 44,
        lineHeight: 44,
        backgroundColor: COLORS.jade,
        color: COLORS.white,
        textAlign: 'center',
        fontSize: 15,
        borderRadius: 18,
      },
    });
    this.userInfoButton.onTap(result => {
      this.loginWithWeChat((result && result.userInfo) || {});
    });
  }

  destroyWeChatLoginButton() {
    if (this.userInfoButton && this.userInfoButton.destroy) this.userInfoButton.destroy();
    this.userInfoButton = null;
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const layout = this.getLayout();
    const actions = this.getActionLayout(layout);
    const growth = progressStore.read(this.runtime.wx);
    const rank = progressStore.level(growth);
    const resume = localMatchStore.load(this.runtime.wx);
    const room = roomSession.read(this.runtime.wx);

    this.drawPlayerBar(ctx, input, layout);
    drawCard(ctx, {
      x: 20,
      y: layout.heroY,
      width: width - 40,
      height: layout.heroHeight,
      fill: COLORS.jade,
      stroke: '#345343',
      radius: 22,
    });
    drawLabel(ctx, 'QIYU  /  落子见真章', 40, layout.heroY + 24, 'left', { bold: true, size: 10, color: '#D8B56E' });
    drawLabel(ctx, '棋遇五子棋', 40, layout.heroY + 56, 'left', { bold: true, size: width < 350 ? 26 : 30, color: '#FFF9EA' });
    drawLabel(ctx, '一局棋，一点进步。', 40, layout.heroY + 85, 'left', { size: 12, color: '#BECEBC' });
    drawMiniBoard(ctx, width - 115, layout.heroY + 25, 65, true);
    drawLabel(ctx, `${rank.title} · ${growth.xp} 修习值`, 40, layout.heroY + layout.heroHeight - 23, 'left', { size: 11, color: '#D8B56E' });
    drawProgressBar(ctx, 40, layout.heroY + layout.heroHeight - 11, width - 80, rank.ratio, true);

    if (!this.player && !this.userInfoButton) {
      drawButton(ctx, input, {
        x: width - 160,
        y: layout.playerY + 2,
        width: 140,
        height: 44,
        text: this.loginLoading ? '登录中…' : '微信快捷登录',
        disabled: this.loginLoading,
        onTap: () => this.loginWithWeChat(),
      });
    }

    drawModeCard(ctx, input, {
      ...actions.ai,
      title: resume ? '继续上次练棋' : '人机对战',
      subtitle: resume ? '未结束棋局已在本机保存' : '三档难度 · 从入门到挑战',
      tag: resume ? '继续' : '练棋',
      onTap: () => resume ? manager.go(resume.mode === 'puzzle' ? 'puzzleGame' : 'aiGame', { resume, puzzleId: resume.puzzleId }) : manager.go('aiGame'),
    });
    drawModeCard(ctx, input, {
      ...actions.puzzle, title: '残局挑战', subtitle: '12 道战术题 · 一步步学会破局', tag: `${Object.keys(growth.puzzles).length}/12`, dark: true,
      onTap: () => manager.go('puzzleList'),
    });
    drawButton(ctx, input, { ...actions.create, text: room ? '继续好友房' : '创建好友房', fontSize: 14, onTap: () => room ? manager.go('onlineGame', room) : manager.go('createRoom') });
    drawButton(ctx, input, { ...actions.join, text: '加入好友房', variant: 'secondary', fontSize: 14, onTap: () => manager.go('joinRoom') });
    drawButton(ctx, input, { ...actions.local, text: '同屏双人', variant: 'gold', fontSize: 14, onTap: () => manager.go('localGame') });
    drawButton(ctx, input, { ...actions.growth, text: '我的成长', variant: 'gold', fontSize: 14, onTap: () => manager.go('growth') });
    drawLabel(ctx, '自由五子棋 · 黑棋先行 · 无禁手', width / 2, actions.noteY, 'center', { size: 11, color: COLORS.inkMuted });
  }

  getLayout() {
    const playerY = getContentTop(this.runtime.wx) + 2;
    const compact = this.runtime.height - playerY - (this.runtime.bottomInset || 18) < 550;
    const heroY = playerY + 60;
    const heroHeight = compact ? 132 : 146;
    return {
      playerY,
      heroY,
      heroHeight,
      compact,
      actionY: heroY + heroHeight + 14,
    };
  }

  getActionLayout(layout = this.getLayout()) {
    const { width } = this.runtime;
    const buttonWidth = width - 40;
    const x = (width - buttonWidth) / 2;
    const halfGap = 12;
    const halfWidth = (buttonWidth - halfGap) / 2;
    const cardHeight = layout.compact ? 64 : 82;
    const ai = { x, y: layout.actionY, width: buttonWidth, height: cardHeight };
    const puzzle = { x, y: ai.y + cardHeight + 12, width: buttonWidth, height: cardHeight };
    const roomY = puzzle.y + cardHeight + 14;
    const create = { x, y: roomY, width: halfWidth, height: 44 };
    const join = { x: x + halfWidth + halfGap, y: roomY, width: halfWidth, height: 44 };
    const lowerY = roomY + 54;
    return {
      create,
      join,
      ai, puzzle,
      local: { x, y: lowerY, width: halfWidth, height: 44 },
      growth: { x: x + halfWidth + halfGap, y: lowerY, width: halfWidth, height: 44 },
      noteY: lowerY + 63,
    };
  }

  drawPlayerBar(ctx, input, layout) {
    const { width, manager } = this.runtime;
    drawCard(ctx, {
      x: 20,
      y: layout.playerY,
      width: width - 40,
      height: 48,
      radius: 16,
      shadow: false,
      fill: COLORS.surface,
    });
    if (!this.player) {
      drawLabel(ctx, '欢迎来练棋', 34, layout.playerY + 16, 'left', { bold: true, size: 14 });
      drawLabel(ctx, '不登录也能玩', 34, layout.playerY + 34, 'left', { size: 10, color: COLORS.inkMuted });
      return;
    }

    drawAvatar(ctx, this.runtime.wx, this.player, 30, layout.playerY + 5, 38, () => manager.render());
    drawLabel(ctx, this.player.nickname, 78, layout.playerY + 17, 'left', { bold: true, size: 14, maxWidth: width - 166 });
    drawLabel(
      ctx,
      this.player.profileCompleted ? '今天也来进步一点' : '点击完善头像昵称',
      78,
      layout.playerY + 35,
      'left',
      { size: 11, color: this.player.profileCompleted ? COLORS.inkMuted : COLORS.danger },
    );
    drawPill(ctx, {
      x: width - 78,
      y: layout.playerY + 8,
      width: 46,
      height: 32,
      text: '资料',
      fill: COLORS.surface,
      color: COLORS.jade,
      stroke: '#7C9A8D',
    });
    input.addHitArea({
      x: 20,
      y: layout.playerY,
      width: width - 40,
      height: 48,
    }, () => manager.go('profile'));
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

function drawHomeDecoration(ctx, width, height) {
  if (height < 760) return;
  const originX = width - 118;
  const originY = height - 118;
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = COLORS.jade;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(originX, originY + i * 20);
    ctx.lineTo(originX + 100, originY + i * 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originX + i * 20, originY);
    ctx.lineTo(originX + i * 20, originY + 100);
    ctx.stroke();
  }
  ctx.restore();
}

module.exports = HomeScene;
