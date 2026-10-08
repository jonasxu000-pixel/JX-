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
const { drawMiniBoard, drawProgressBar } = require('../renderers/practiceRenderer');
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
    const start = playerY + 66;
    const bottom = this.runtime.height - (this.runtime.bottomInset || 18) - 14;
    const available = bottom - start;
    const budget = Math.max(0, available - 58);
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const primaryHeight = clamp(budget * 0.4, 148, 184);
    const puzzleHeight = clamp(budget * 0.22, 72, 102);
    const friendHeight = clamp(budget * 0.21, 74, 98);
    const dockHeight = clamp(budget * 0.12, 40, 54);
    const sectionHeight = primaryHeight + puzzleHeight + friendHeight + dockHeight + 58;
    const gap = clamp((available - sectionHeight + 30) / 3, 10, 34);
    return { playerY, start, primaryHeight, puzzleHeight, friendHeight, dockHeight, gap, compact: available < 425 };
  }
  getActionLayout(layout = this.getLayout()) {
    const width = this.runtime.width;
    const x = 20; const w = width - 40; const half = (w - 12) / 2;
    const ai = { x, y: layout.start, width: w, height: layout.primaryHeight };
    const difficultyY = ai.y + (layout.compact ? 52 : 70);
    const startButton = { x: x + 12, y: ai.y + ai.height - 50, width: w - 24, height: 42 };
    const puzzle = { x, y: ai.y + ai.height + layout.gap, width: w, height: layout.puzzleHeight };
    const pairY = puzzle.y + puzzle.height + layout.gap;
    const friend = { x, y: pairY, width: w, height: layout.friendHeight };
    const quickWidth = Math.min(74, Math.max(62, (w - 164) / 2));
    const create = { x: width - 24 - quickWidth * 2 - 8, y: friend.y + (friend.height - 42) / 2, width: quickWidth, height: 42 };
    const join = { x: create.x + quickWidth + 8, y: create.y, width: quickWidth, height: 42 };
    const fresh = { x: startButton.x + startButton.width - 66, y: difficultyY, width: 58, height: 40 };
    const dockY = friend.y + friend.height + layout.gap;
    const growth = { x: x + half + 12, y: dockY, width: half, height: layout.dockHeight };
    return { ai: startButton, hero: ai, difficultyY, startButton, puzzle, friend, create, join, fresh,
      local: { x, y: dockY, width: half, height: layout.dockHeight }, growth,
      settings: { x: width - 64, y: layout.playerY + 2, width: 44, height: 44 },
      noteY: growth.y + layout.dockHeight + 14 };
  }

  render(ctx, input) {
    const { width, height, manager, wx } = this.runtime;
    const layout = this.getLayout(); const actions = this.getActionLayout(layout);
    const data = progressStore.read(wx); const resume = localMatchStore.load(wx); const room = roomSession.read(wx);
    const atlas = lobby.loadAtlas(wx, this.onImageReady);
    const backdrop = lobby.loadBackdrop(wx, this.onImageReady);
    ctx.fillStyle = '#F2ECDF'; ctx.fillRect(0, 0, width, height);
    if (backdrop) ctx.drawImage(backdrop, 0, 0, width, height);
    drawAvatar(ctx, wx, this.player, 20, layout.playerY, 48, this.onImageReady);
    drawLabel(ctx, this.player ? this.player.nickname : '游客', 44, layout.playerY + 58, 'center', { size: 9, color: '#81755E', maxWidth: 62 });
    if (this.player || !this.userInfoButton) input.addHitArea({ x: 20, y: layout.playerY, width: 48, height: 48 }, () => {
      if (!this.player) { this.loginWithWeChat(); return; }
      this.sheet = 'player'; this.stopAnimation(); manager.render();
    });
    ctx.fillStyle = '#214E42'; ctx.font = '700 25px "STKaiti", "KaiTi", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('棋遇五子棋', width / 2, layout.playerY + 18);
    const rank = progressStore.level(data);
    drawLabel(ctx, `${rank.title} · ${data.xp} 修习值`, width / 2, layout.playerY + 43, 'center', { size: 9, color: '#837456' });
    drawProgressBar(ctx, width / 2 - 42, layout.playerY + 53, 84, rank.ratio);
    lobby.drawIconButton(ctx, input, actions.settings, 'settings', () => manager.go('settings'));

    lobby.drawPlate(ctx, actions.hero, 'jade', atlas);
    const offset = this.animationStart ? Math.sin((Date.now() - this.animationStart) / 300) * 1.5 : 0;
    const vignetteSize = layout.compact ? 60 : 92;
    lobby.drawFriends(ctx, atlas, { x: width - vignetteSize - 32, y: actions.hero.y + 5 + offset, width: vignetteSize, height: vignetteSize * 0.81 });
    drawLabel(ctx, resume ? '继续对弈' : '人机对弈', 38, actions.hero.y + 20, 'left', { size: 20, bold: true, color: '#FFF2CD', maxWidth: width - 170 });
    drawLabel(ctx, resume ? (resume.mode === 'puzzle' ? '上次残局已为你保存' : '接着上次的棋局继续') : '选择难度，开始下一盘', 38, actions.hero.y + 41, 'left', { size: 10, color: '#DAE9CF', maxWidth: width - 170 });
    const difficultyWidth = (width - 96) / 3;
    if (resume) {
      drawLabel(ctx, '继续上局', 28, actions.difficultyY + 20, 'left', { size: 12, color: '#8B7957' });
    } else [['easy','入门'],['normal','进阶'],['hard','挑战']].forEach(([id,label], index) => {
      const rect = { x: 32 + index * (difficultyWidth + 8), y: actions.difficultyY, width: difficultyWidth, height: 40 };
      drawCard(ctx, { ...rect, radius: 14, fill: data.settings.difficulty === id ? '#E4CD98' : '#F3EADC', stroke: data.settings.difficulty === id ? '#AB8B51' : '#D8C9A9', shadow: false });
      drawLabel(ctx, label, rect.x + rect.width / 2, rect.y + 20, 'center', { size: 13, bold: data.settings.difficulty === id, color: '#645235' });
      input.addHitArea(rect, () => { progressStore.setSetting(wx, 'difficulty', id); manager.render(); });
    });
    const startText = resume ? '继续这盘' : '开始练棋';
    drawButton(ctx, input, { ...actions.startButton, text: startText, variant: 'primary', fill: '#174B3A', stroke: '#D2B16D', fontSize: 15, onTap: () => resume ? manager.go(resume.mode === 'puzzle' ? 'puzzleGame' : 'aiGame', { resume, puzzleId: resume.puzzleId }) : manager.go('aiGame') });
    if (resume) drawButton(ctx, input, { ...actions.fresh, text: '新开', variant: 'gold', fontSize: 12, onTap: () => manager.go('aiGame') });

    lobby.drawPlate(ctx, actions.puzzle, 'gold', atlas);
    const puzzleBoardSize = Math.min(58, actions.puzzle.height - 16);
    lobby.drawFriends(ctx, atlas, { x: actions.puzzle.x + 14, y: actions.puzzle.y + (actions.puzzle.height - puzzleBoardSize * 0.76) / 2, width: puzzleBoardSize, height: puzzleBoardSize * 0.76 });
    drawLabel(ctx, '残局挑战', actions.puzzle.x + 82, actions.puzzle.y + actions.puzzle.height * 0.37, 'left', { size: width < 350 ? 18 : 20, bold: true, color: '#714716' });
    drawLabel(ctx, '3～7 手连续攻杀', actions.puzzle.x + 82, actions.puzzle.y + actions.puzzle.height * 0.68, 'left', { size: 10, color: '#946A31', maxWidth: width - 148 });
    const cleared = puzzles.CHALLENGES.filter(puzzle => data.puzzles[puzzle.id]).length;
    drawLabel(ctx, `${cleared}/12`, width - 48, actions.puzzle.y + actions.puzzle.height * 0.5, 'right', { size: 10, bold: true, color: '#8A5D28' });
    input.addHitArea(actions.puzzle, () => manager.go('puzzleList')); lobby.pressOverlay(ctx, input, actions.puzzle);

    lobby.drawPlate(ctx, actions.friend, 'cream', atlas);
    drawIcon(ctx, 'users', actions.friend.x + 14, actions.friend.y + actions.friend.height / 2 - 11, 22, '#668367');
    drawLabel(ctx, '好友对弈', actions.friend.x + 46, actions.friend.y + actions.friend.height * 0.38, 'left', { size: width < 350 ? 14 : 17, bold: true, color: '#5C503B' });
    drawLabel(ctx, room ? '好友房已保存' : '邀请朋友来一盘', actions.friend.x + 46, actions.friend.y + actions.friend.height * 0.68, 'left', { size: 9, color: '#92816B', maxWidth: actions.create.x - actions.friend.x - 52 });
    drawButton(ctx, input, { ...actions.create, text: room ? '继续' : '创建', variant: 'primary', fontSize: 11, onTap: () => room ? manager.go(room.waiting ? 'waitRoom' : 'onlineGame', room) : manager.go('createRoom') });
    drawButton(ctx, input, { ...actions.join, text: '加入', variant: 'gold', fontSize: 11, onTap: () => manager.go('joinRoom') });
    [[actions.local,'users','同屏双人','localGame'],[actions.growth,'sprout','我的成长','growth']].forEach(([rect, icon, label, scene]) => {
      lobby.drawPlate(ctx, rect, 'cream', atlas);
      drawIcon(ctx, icon, rect.x + 18, rect.y + (rect.height - 22) / 2, 22, '#668367');
      drawLabel(ctx, label, rect.x + 49, rect.y + rect.height / 2, 'left', { bold: true, size: width < 350 ? 13 : 14, color: '#65583D' });
      input.addHitArea(rect, () => manager.go(scene)); lobby.pressOverlay(ctx, input, rect);
    });
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
