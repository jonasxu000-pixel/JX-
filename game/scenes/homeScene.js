const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');
const { getStoredPlayer, savePlayer } = require('../../utils/playerSession');
const { showToast } = require('../../utils/clipboard');
const { drawAvatar } = require('../renderers/avatarRenderer');

class HomeScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.player = getStoredPlayer(runtime.wx);
    this.loginLoading = false;
    this.userInfoButton = null;
  }

  onEnter() {
    this.createWeChatLoginButton();
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
        this.player = savePlayer(this.runtime.wx, openId, userInfo);
        this.destroyWeChatLoginButton();
        showToast(this.runtime.wx, '微信账号登录成功', 'success');
      })
      .catch(err => {
        showToast(this.runtime.wx, err.message || '微信登录失败，请重试');
      })
      .finally(() => {
        this.loginLoading = false;
        this.runtime.manager.render();
      });
  }

  createWeChatLoginButton() {
    const wxApi = this.runtime.wx;
    if (!this.needsWeChatProfile()
      || this.userInfoButton
      || !wxApi
      || typeof wxApi.createUserInfoButton !== 'function') return;
    const { width } = this.runtime;
    this.userInfoButton = wxApi.createUserInfoButton({
      type: 'text',
      text: '微信快捷登录',
      withCredentials: false,
      lang: 'zh_CN',
      style: {
        left: width / 2 + 8,
        top: 191,
        width: 100,
        height: 38,
        lineHeight: 38,
        backgroundColor: COLORS.blueSoft,
        color: COLORS.blue,
        textAlign: 'center',
        fontSize: 12,
        borderRadius: 16,
      },
    });
    this.userInfoButton.onTap(result => {
      if (!result || !result.userInfo) {
        this.loginWithWeChat({});
        showToast(wxApi, '已使用默认玩家资料');
        return;
      }
      this.loginWithWeChat(result.userInfo);
    });
  }

  destroyWeChatLoginButton() {
    if (this.userInfoButton && this.userInfoButton.destroy) this.userInfoButton.destroy();
    this.userInfoButton = null;
  }

  render(ctx, input) {
    const { width, height, manager } = this.runtime;
    const buttonWidth = Math.min(width - 56, 300);
    const x = (width - buttonWidth) / 2;
    const startY = Math.max(300, height * 0.43);

    drawCard(ctx, {
      x: 20,
      y: 34,
      width: width - 40,
      height: 226,
      fill: COLORS.surface,
    });
    drawBrandStones(ctx, width / 2, 84);
    drawTitle(ctx, '你棋没我硬', width / 2, 132);
    drawSubtitle(ctx, '好友联机五子棋 · 落子见真章', width / 2, 166);
    drawPill(ctx, {
      x: width / 2 - 108,
      y: 191,
      width: 100,
      height: 38,
      text: '好友实时联机',
    });
    if (this.player && !this.needsWeChatProfile()) {
      this.drawPlayerBadge(ctx, input);
    } else if (!this.userInfoButton) {
      drawButton(ctx, input, {
        x: width / 2 + 8,
        y: 191,
        width: 100,
        height: 38,
        text: this.loginLoading ? '登录中…' : '微信快捷登录',
        variant: 'secondary',
        fontSize: 12,
        disabled: this.loginLoading,
        onTap: () => this.loginWithWeChat(),
      });
    }

    drawButton(ctx, input, {
      x,
      y: startY,
      width: buttonWidth,
      height: 52,
      text: '本机双人对战',
      variant: 'gold',
      onTap: () => manager.go('localGame'),
    });

    drawButton(ctx, input, {
      x,
      y: startY + 72,
      width: buttonWidth,
      height: 52,
      text: '创建好友房',
      onTap: () => manager.go('createRoom'),
    });

    drawButton(ctx, input, {
      x,
      y: startY + 144,
      width: buttonWidth,
      height: 52,
      text: '加入好友房',
      variant: 'secondary',
      onTap: () => manager.go('joinRoom'),
    });

    drawSubtitle(ctx, '创建房间 · 邀请好友 · 随时开局', width / 2, startY + 220);
  }

  needsWeChatProfile() {
    return !this.player || !this.player.wechatNickname;
  }

  drawPlayerBadge(ctx, input) {
    const { width, manager } = this.runtime;
    const x = width / 2 + 8;
    drawCard(ctx, {
      x,
      y: 191,
      width: 100,
      height: 38,
      radius: 16,
      shadow: false,
      fill: COLORS.blueSoft,
      stroke: '#C8DAE7',
    });
    drawAvatar(ctx, this.runtime.wx, this.player, x + 5, 195, 30, () => manager.render());
    const nickname = this.player.nickname.length > 5
      ? `${this.player.nickname.slice(0, 5)}…`
      : this.player.nickname;
    ctx.fillStyle = COLORS.blue;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nickname, x + 67, 210);
    input.addHitArea({ x, y: 191, width: 100, height: 38 }, () => manager.go('profile'));
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

module.exports = HomeScene;
