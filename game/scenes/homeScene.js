const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard } = require('../renderers/cardRenderer');
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
const { drawMiniBoard } = require('../renderers/practiceRenderer');
const { drawIcon } = require('../renderers/iconRenderer');
const lobby = require('../renderers/lobbyRenderer');
const puzzles = require('../../utils/puzzles');

class HomeScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.player = getStoredPlayer(runtime.wx);
    this.loginLoading = false;
    this.userInfoButton = null;
    this.active = false;
    this.sheet = false;
    this.frame = null;
    this.animationStart = 0;
    this.onImageReady = () => { if (this.active) this.runtime.manager.render(); };
  }

  onEnter() {
    this.active = true;
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatLoginButton();
    this.startAnimation();
  }

  onResume() {
    this.active = true;
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatLoginButton();
    this.startAnimation();
  }

  onHide() {
    this.active = false;
    this.destroyWeChatLoginButton();
    this.stopAnimation();
  }

  onExit() {
    this.active = false;
    this.destroyWeChatLoginButton();
    this.stopAnimation();
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
      || this.sheet
      || this.userInfoButton
      || !wxApi
      || typeof wxApi.createUserInfoButton !== 'function') return;
    const layout = this.getLayout();
    this.userInfoButton = wxApi.createUserInfoButton({
      type: 'text',
      text: '',
      withCredentials: false,
      lang: 'zh_CN',
      style: {
        left: 20,
        top: layout.playerY,
        width: 48,
        height: 48,
        lineHeight: 48,
        backgroundColor: 'transparent',
        color: 'transparent',
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

  startAnimation() {
    this.stopAnimation();
    const canvas = this.runtime.canvas;
    if (!progressStore.read(this.runtime.wx).settings.motion || !canvas.requestAnimationFrame) return;
    this.animationStart = Date.now(); let painted = 0;
    const tick = () => {
      this.frame = null;
      if (!this.active || this.sheet) return;
      const elapsed = Date.now() - this.animationStart;
      if (elapsed - painted >= 42) { painted = elapsed; this.runtime.manager.render(); }
      if (elapsed < 2200) this.frame = canvas.requestAnimationFrame(tick);
      else { this.animationStart = 0; this.runtime.manager.render(); }
    };
    this.frame = canvas.requestAnimationFrame(tick);
  }
  stopAnimation() {
    if (this.frame !== null && this.runtime.canvas.cancelAnimationFrame) this.runtime.canvas.cancelAnimationFrame(this.frame);
    this.frame = null; this.animationStart = 0;
  }

  getLayout() {
    const playerY = getContentTop(this.runtime.wx) + 2;
    const start = playerY + 68;
    const bottom = this.runtime.height - (this.runtime.bottomInset || 18) - 26;
    const available = bottom - start;
    const flexible = available - 128;
    const primaryHeight = Math.min(178, flexible * 0.4);
    const puzzleHeight = Math.min(140, flexible * 0.32);
    const pairHeight = Math.min(104, flexible * 0.28);
    return { playerY, start, primaryHeight, puzzleHeight, pairHeight, compact: available < 425 };
  }
  getActionLayout(layout = this.getLayout()) {
    const width = this.runtime.width;
    const x = 20; const w = width - 40; const half = (w - 12) / 2;
    const ai = { x, y: layout.start, width: w, height: layout.primaryHeight };
    const difficultyY = ai.y + ai.height + 8;
    const puzzle = { x, y: difficultyY + 52, width: w, height: layout.puzzleHeight };
    const pairY = puzzle.y + puzzle.height + 12;
    const friend = { x, y: pairY, width: half, height: layout.pairHeight };
    const sheetY = Math.max(getContentTop(this.runtime.wx), (this.runtime.height - 266) / 2);
    const create = { x: 40, y: sheetY + 116, width: width - 80, height: 44 };
    const join = { x: 40, y: sheetY + 176, width: width - 80, height: 44 };
    const dockY = pairY + layout.pairHeight + 12;
    return { ai, difficultyY, puzzle, friend, create, join,
      local: { x: x + half + 12, y: pairY, width: half, height: layout.pairHeight },
      growth: { x, y: dockY, width: w, height: 44 },
      fresh: { x: width - 160, y: difficultyY, width: 140, height: 40 },
      settings: { x: width - 64, y: layout.playerY + 2, width: 44, height: 44 },
      noteY: dockY + 64 };
  }

  render(ctx, input) {
    const { width, height, manager, wx } = this.runtime;
    const layout = this.getLayout(); const actions = this.getActionLayout(layout);
    const data = progressStore.read(wx); const resume = localMatchStore.load(wx); const room = roomSession.read(wx);
    const atlas = lobby.loadAtlas(wx, this.onImageReady);
    ctx.fillStyle = '#EEE7D6'; ctx.fillRect(0, 0, width, height);
    drawAvatar(ctx, wx, this.player, 20, layout.playerY, 48, this.onImageReady);
    drawLabel(ctx, this.player ? '我的棋遇' : '游客 · 点此登录', 44, layout.playerY + 59, 'center', { size: 9, color: '#81755E' });
    if (this.player || !this.userInfoButton) input.addHitArea({ x: 20, y: layout.playerY, width: 48, height: 48 }, () => {
      if (!this.player) { this.loginWithWeChat(); return; }
      this.sheet = 'player'; this.stopAnimation(); manager.render();
    });
    ctx.fillStyle = '#214E42'; ctx.font = '700 32px "STKaiti", "KaiTi", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('棋遇', width / 2, layout.playerY + 18);
    drawLabel(ctx, '棋遇五子棋', width / 2, layout.playerY + 43, 'center', { size: 10, color: '#837456' });
    lobby.drawIconButton(ctx, input, actions.settings, 'settings', () => manager.go('settings'));

    lobby.drawPlate(ctx, actions.ai, 'jade', atlas);
    const offset = this.animationStart ? Math.sin((Date.now() - this.animationStart) / 300) * 2 : 0;
    lobby.drawFriends(ctx, atlas, { x: width - 136, y: actions.ai.y + 8 + offset, width: 112, height: actions.ai.height - 12 });
    drawLabel(ctx, resume ? '继续棋局' : '开始对弈', 40, actions.ai.y + actions.ai.height * 0.42, 'left', { size: width < 350 ? 24 : 28, bold: true, color: '#FFF2CD' });
    drawLabel(ctx, resume ? (resume.mode === 'puzzle' ? '继续上次的残局' : '继续上次的人机局') : '人机练棋 · 黑棋先手', 40, actions.ai.y + actions.ai.height * 0.72, 'left', { size: 11, color: '#DAE9CF', maxWidth: width - 165 });
    input.addHitArea(actions.ai, () => resume ? manager.go(resume.mode === 'puzzle' ? 'puzzleGame' : 'aiGame', { resume, puzzleId: resume.puzzleId }) : manager.go('aiGame'));
    lobby.pressOverlay(ctx, input, actions.ai);
    const difficultyWidth = (width - 56) / 3;
    if (resume) {
      drawLabel(ctx, resume.mode === 'puzzle' ? '还有一道残局未完成' : '上次的人机局未结束', 24, actions.difficultyY + 20, 'left', { size: 11, color: '#8B7957', maxWidth: width - 192 });
      drawButton(ctx, input, { ...actions.fresh, text: '新开人机局', variant: 'gold', fontSize: 13, onTap: () => manager.go('aiGame') });
    } else [['easy','入门'],['normal','进阶'],['hard','挑战']].forEach(([id,label], index) => {
      const rect = { x: 20 + index * (difficultyWidth + 8), y: actions.difficultyY, width: difficultyWidth, height: 40 };
      drawCard(ctx, { ...rect, radius: 16, fill: data.settings.difficulty === id ? '#E6CB8E' : '#F5EFDF', stroke: '#D8C9A9', shadow: false });
      drawLabel(ctx, label, rect.x + rect.width / 2, rect.y + 20, 'center', { size: 14, bold: data.settings.difficulty === id, color: '#645235' });
      input.addHitArea(rect, () => { progressStore.setSetting(wx, 'difficulty', id); manager.render(); });
    });

    lobby.drawPlate(ctx, actions.puzzle, 'gold', atlas);
    drawLabel(ctx, '残局挑战', 40, actions.puzzle.y + actions.puzzle.height * 0.38, 'left', { size: width < 350 ? 23 : 26, bold: true, color: '#714716' });
    drawLabel(ctx, '连续攻杀 · 3～7 手推演', 40, actions.puzzle.y + actions.puzzle.height * 0.63, 'left', { size: 11, color: '#946A31' });
    const boardSize = Math.min(66, actions.puzzle.height - 28);
    drawMiniBoard(ctx, width - 103, actions.puzzle.y + (actions.puzzle.height - boardSize) / 2, boardSize);
    const cleared = puzzles.CHALLENGES.filter(puzzle => data.puzzles[puzzle.id]).length;
    drawLabel(ctx, `${cleared}/12 已通关`, 40, actions.puzzle.y + actions.puzzle.height * 0.82, 'left', { size: 9, color: '#8A5D28' });
    input.addHitArea(actions.puzzle, () => manager.go('puzzleList')); lobby.pressOverlay(ctx, input, actions.puzzle);

    lobby.drawPlate(ctx, actions.friend, 'cream', atlas);
    const showPairIcons = actions.friend.height >= 70;
    if (showPairIcons) drawIcon(ctx, 'users', actions.friend.x + actions.friend.width / 2 - 11, actions.friend.y + 8, 23, '#668367');
    drawLabel(ctx, '好友对弈', actions.friend.x + actions.friend.width / 2, actions.friend.y + actions.friend.height * (showPairIcons ? 0.57 : 0.4), 'center', { size: width < 350 ? 16 : 18, bold: true, color: '#5C503B' });
    drawLabel(ctx, room ? '有未结束的好友房' : '建房 / 输入房间号', actions.friend.x + actions.friend.width / 2, actions.friend.y + actions.friend.height * 0.81, 'center', { size: 9, color: '#92816B' });
    input.addHitArea(actions.friend, () => { this.sheet = 'friend'; this.destroyWeChatLoginButton(); this.stopAnimation(); manager.render(); });
    lobby.pressOverlay(ctx, input, actions.friend);
    [[actions.local,'users','同屏双人','localGame']].forEach(([rect, icon, label, scene]) => {
      lobby.drawPlate(ctx, rect, 'cream', atlas);
      if (showPairIcons) drawIcon(ctx, icon, rect.x + rect.width / 2 - 11, rect.y + 8, 23, '#668367');
      drawLabel(ctx, label, rect.x + rect.width / 2, rect.y + rect.height * (showPairIcons ? 0.57 : 0.4), 'center', { bold: true, size: width < 350 ? 16 : 18, color: '#65583D' });
      drawLabel(ctx, '一台手机，两人下棋', rect.x + rect.width / 2, rect.y + rect.height * 0.81, 'center', { size: 9, color: '#92816B' });
      input.addHitArea(rect, () => manager.go(scene)); lobby.pressOverlay(ctx, input, rect);
    });
    drawIcon(ctx, 'sprout', width / 2 - 51, actions.growth.y + 11, 22, '#668367');
    drawLabel(ctx, '我的成长', width / 2 - 20, actions.growth.y + 23, 'left', { size: 13, color: '#7C6A4B' });
    input.addHitArea(actions.growth, () => manager.go('growth'));
    drawLabel(ctx, '自由五子棋 · 黑棋先行 · 无禁手', width / 2, actions.noteY, 'center', { size: 10, color: '#9A8B73' });
    if (this.sheet === 'player') this.drawPlayerSheet(ctx, input, data);
    if (this.sheet === 'friend') this.drawFriendSheet(ctx, input, room);
  }

  closeSheet() { this.sheet = false; this.createWeChatLoginButton(); this.runtime.manager.render(); }
  drawFriendSheet(ctx, input, room) {
    const { width, height, manager, wx } = this.runtime;
    input.beginFrame(); ctx.fillStyle = 'rgba(32,43,32,.3)'; ctx.fillRect(0, 0, width, height);
    input.addHitArea({ x: 0, y: 0, width, height }, () => this.closeSheet());
    const y = Math.max(getContentTop(wx), (height - 266) / 2);
    drawCard(ctx, { x: 20, y, width: width - 40, height: 266, fill: '#FCF5E6', stroke: '#D7C3A0', radius: 24 });
    input.addHitArea({ x: 20, y, width: width - 40, height: 266 }, () => {});
    drawLabel(ctx, '好友对弈', 40, y + 38, 'left', { bold: true, size: 23 });
    drawLabel(ctx, '通过房间号邀请朋友加入', 40, y + 76, 'left', { size: 12, color: '#96805B' });
    lobby.drawIconButton(ctx, input, { x: width - 76, y: y + 16, width: 44, height: 44 }, 'x', () => this.closeSheet());
    const actions = this.getActionLayout();
    drawButton(ctx, input, { ...actions.create, text: room ? '继续上次好友房' : '创建好友房', onTap: () => room ? manager.go(room.waiting ? 'waitRoom' : 'onlineGame', room) : manager.go('createRoom') });
    drawButton(ctx, input, { ...actions.join, text: '加入好友房', variant: 'gold', onTap: () => manager.go('joinRoom') });
  }

  drawPlayerSheet(ctx, input, data) {
    const { width, height, manager, wx } = this.runtime;
    input.beginFrame(); ctx.fillStyle = 'rgba(32,43,32,.3)'; ctx.fillRect(0, 0, width, height);
    input.addHitArea({ x: 0, y: 0, width, height }, () => { this.sheet = false; manager.render(); });
    const y = Math.max(getContentTop(wx), (height - 266) / 2);
    drawCard(ctx, { x: 20, y, width: width - 40, height: 266, fill: '#FCF5E6', stroke: '#D7C3A0', radius: 24 });
    input.addHitArea({ x: 20, y, width: width - 40, height: 266 }, () => {});
    drawAvatar(ctx, wx, this.player, 40, y + 24, 54, this.onImageReady);
    drawLabel(ctx, this.player.nickname, 110, y + 40, 'left', { bold: true, size: 18, maxWidth: width - 182 });
    drawLabel(ctx, progressStore.level(data).title, 110, y + 66, 'left', { size: 12, color: '#96805B' });
    lobby.drawIconButton(ctx, input, { x: width - 76, y: y + 16, width: 44, height: 44 }, 'x', () => { this.sheet = false; manager.render(); });
    const totals = progressStore.totals(data);
    drawLabel(ctx, `${data.xp} 修习值  ·  人机 ${totals.played} 局  ·  获胜 ${totals.wins} 局`, width / 2, y + 110, 'center', { size: 12, color: '#7C6A4B', maxWidth: width - 74 });
    drawButton(ctx, input, { x: 40, y: y + 143, width: width - 80, height: 44, text: '头像与昵称', variant: 'secondary', onTap: () => manager.go('profile') });
    drawButton(ctx, input, { x: 40, y: y + 201, width: width - 80, height: 44, text: '查看成长与战绩', variant: 'gold', onTap: () => manager.go('growth') });
  }
}
module.exports = HomeScene;
