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

class HomeScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.player = getStoredPlayer(runtime.wx);
    this.loginLoading = false;
    this.userInfoButton = null;
  }

  onEnter() {
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatLoginButton();
  }

  onResume() {
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatLoginButton();
  }

  onHide() {
    this.destroyWeChatLoginButton();
  }

  onExit() {
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
        this.destroyWeChatLoginButton();
        if (profile.usable) {
          showToast(this.runtime.wx, '微信账号登录成功', 'success');
        } else {
          showToast(this.runtime.wx, '身份已连接，请完善头像昵称');
          this.runtime.manager.go('profile');
        }
      })
      .catch(err => {
        showToast(this.runtime.wx, toUserMessage(err, '微信登录失败'));
      })
      .finally(() => {
        this.loginLoading = false;
        this.runtime.manager.render();
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
        left: 28,
        top: layout.playerY + 10,
        width: width - 56,
        height: 54,
        lineHeight: 54,
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

    this.drawPlayerBar(ctx, input, layout);

    drawCard(ctx, {
      x: 20,
      y: layout.heroY,
      width: width - 40,
      height: layout.heroHeight,
      fill: COLORS.surface,
    });
    drawBrandStones(ctx, width / 2, layout.heroY + layout.heroStoneOffset);
    drawTitle(ctx, '棋遇五子棋', width / 2, layout.heroY + layout.heroTitleOffset);
    drawSubtitle(ctx, '好友联机五子棋 · 落子见真章', width / 2, layout.heroY + layout.heroSubtitleOffset);
    drawPill(ctx, {
      x: width / 2 - 72,
      y: layout.heroY + layout.heroPillOffset,
      width: 144,
      height: 34,
      text: '15 路棋盘 · 黑棋先行',
    });

    if (!this.player && !this.userInfoButton) {
      drawButton(ctx, input, {
        x: 28,
        y: layout.playerY + 10,
        width: width - 56,
        height: 54,
        text: this.loginLoading ? '登录中…' : '微信快捷登录',
        disabled: this.loginLoading,
        onTap: () => this.loginWithWeChat(),
      });
    }

    drawButton(ctx, input, {
      ...actions.create,
      text: '创建好友房',
      onTap: () => manager.go('createRoom'),
    });

    drawButton(ctx, input, {
      ...actions.join,
      text: '加入好友房',
      variant: 'secondary',
      onTap: () => manager.go('joinRoom'),
    });

    drawButton(ctx, input, {
      ...actions.ai,
      text: '人机对战',
      variant: 'gold',
      fill: COLORS.jadeSoft,
      textColor: COLORS.jade,
      stroke: '#B8C9C0',
      onTap: () => manager.go('aiGame'),
    });

    drawButton(ctx, input, {
      ...actions.local,
      text: '同屏双人对战',
      variant: 'gold',
      onTap: () => manager.go('localGame'),
    });

    drawSubtitle(ctx, '好友联机 · 人机对弈 · 同屏对战', width / 2, actions.noteY);
    drawHomeDecoration(ctx, width, this.runtime.height);
  }

  getLayout() {
    const playerY = getContentTop(this.runtime.wx);
    const heroY = playerY + 88;
    const compact = this.runtime.height < 720;
    const heroHeight = compact ? 146 : 190;
    return {
      playerY,
      heroY,
      heroHeight,
      heroStoneOffset: compact ? 24 : 34,
      heroTitleOffset: compact ? 56 : 78,
      heroSubtitleOffset: compact ? 84 : 110,
      heroPillOffset: compact ? 104 : 138,
      actionY: heroY + heroHeight + 16,
    };
  }

  getActionLayout(layout = this.getLayout()) {
    const { width } = this.runtime;
    const buttonWidth = Math.min(width - 48, 340);
    const x = (width - buttonWidth) / 2;
    const halfGap = 12;
    const halfWidth = (buttonWidth - halfGap) / 2;
    const create = { x, y: layout.actionY, width: buttonWidth, height: 52 };
    const join = { x, y: create.y + create.height + 10, width: buttonWidth, height: 50 };
    const lowerY = join.y + join.height + 10;
    return {
      create,
      join,
      ai: { x, y: lowerY, width: halfWidth, height: 48 },
      local: { x: x + halfWidth + halfGap, y: lowerY, width: halfWidth, height: 48 },
      noteY: lowerY + 74,
    };
  }

  drawPlayerBar(ctx, input, layout) {
    const { width, manager } = this.runtime;
    drawCard(ctx, {
      x: 20,
      y: layout.playerY,
      width: width - 40,
      height: 72,
      radius: 20,
      fill: this.player ? COLORS.surface : COLORS.jadeSoft,
    });
    if (!this.player) {
      return;
    }

    drawAvatar(ctx, this.runtime.wx, this.player, 32, layout.playerY + 10, 52, () => manager.render());
    drawLabel(ctx, this.player.nickname, 96, layout.playerY + 26, 'left', { bold: true, size: 16 });
    drawLabel(
      ctx,
      this.player.profileCompleted ? '微信身份已连接 · 点击编辑资料' : '微信身份已连接 · 请完善头像昵称',
      96,
      layout.playerY + 50,
      'left',
      { size: 11, color: this.player.profileCompleted ? COLORS.inkMuted : COLORS.danger },
    );
    drawPill(ctx, {
      x: width - 78,
      y: layout.playerY + 19,
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
      height: 72,
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
