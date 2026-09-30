const puzzles = require('../../utils/puzzles');
const progress = require('../../utils/progressStore');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard } = require('../renderers/cardRenderer');
const { drawPageHeader, drawProgressBar } = require('../renderers/practiceRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');

class PuzzleListScene {
  constructor(runtime) { this.runtime = runtime; this.chapter = 3; this.track = 'challenge'; }
  onEnter() {
    const data = progress.read(this.runtime.wx);
    const next = puzzles.CHALLENGES.find(puzzle => !data.puzzles[puzzle.id]);
    this.chapter = next ? next.chapter - 1 : 5;
  }
  render(ctx, input) {
    const { width, manager, wx } = this.runtime;
    const height = this.runtime.height - Math.max(0, (this.runtime.bottomInset || 18) - 18);
    const top = getContentTop(wx);
    const data = progress.read(wx);
    const challenge = this.track === 'challenge';
    const list = challenge ? puzzles.CHALLENGES : puzzles.TUTORIALS;
    const cleared = list.filter(puzzle => data.puzzles[puzzle.id]).length;
    drawPageHeader(ctx, width, top, '残局挑战', challenge ? '连续攻杀，推演守方的每次应手。' : '先认识战术，再挑战更长的攻杀链。');
    const half = (width - 48) / 2;
    [['challenge','烧脑挑战 · 3～7 手'],['tutorial','入门练习 · 1～2 手']].forEach(([id,title], i) => {
      drawButton(ctx, input, { x: 20 + i * (half + 8), y: top + 76, width: half, height: 40, text: title, fontSize: 11, variant: this.track === id ? 'primary' : 'gold', onTap: () => { this.track = id; this.chapter = id === 'challenge' ? 3 : 0; manager.render(); } });
    });
    drawProgressBar(ctx, 20, top + 124, width - 40, cleared / list.length);
    drawLabel(ctx, `${cleared}/${list.length} 已通关 · 每章首题可直接挑战`, 20, top + 138, 'left', { size: 10, color: COLORS.inkMuted });
    const gap = 8; const tabWidth = (width - 40 - gap * 2) / 3;
    const base = challenge ? 3 : 0;
    puzzles.CHAPTERS.slice(base, base + 3).forEach((title, i) => {
      const index = base + i;
      drawButton(ctx, input, { x: 20 + i * (tabWidth + gap), y: top + 152, width: tabWidth, height: 40, text: title, fontSize: 12, variant: index === this.chapter ? 'primary' : 'gold', onTap: () => { this.chapter = index; manager.render(); } });
    });
    const startY = top + 202;
    const rowHeight = Math.max(44, Math.min(70, (height - startY - 78) / 4));
    puzzles.PUZZLES.slice(this.chapter * 4, this.chapter * 4 + 4).forEach((puzzle, offset) => {
      const index = this.chapter * 4 + offset;
      const unlocked = puzzles.isUnlocked(index, data);
      const stars = data.puzzles[puzzle.id] || 0;
      const y = startY + offset * rowHeight;
      drawCard(ctx, { x: 20, y, width: width - 40, height: rowHeight - 6, radius: 14, shadow: false, fill: unlocked ? COLORS.surface : COLORS.surfaceMuted });
      drawLabel(ctx, String(list.indexOf(puzzle) + 1).padStart(2, '0'), 34, y + (rowHeight - 6) / 2, 'left', { bold: true, size: 20, color: unlocked ? COLORS.gold : '#A5AA9F' });
      drawLabel(ctx, puzzle.title, 72, y + (rowHeight - 8) * 0.34, 'left', { bold: true, size: 15, color: unlocked ? COLORS.ink : COLORS.inkMuted });
      drawLabel(ctx, unlocked ? `${puzzle.moves} 手内取胜` : '先通关本章上一题', 72, y + (rowHeight - 6) * 0.76, 'left', { size: 10, color: COLORS.inkMuted });
      drawLabel(ctx, stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : (unlocked ? '挑战 →' : '待解锁'), width - 34, y + (rowHeight - 8) / 2, 'right', { bold: true, size: 12, color: unlocked ? COLORS.gold : COLORS.inkMuted });
      input.addHitArea({ x: 20, y, width: width - 40, height: rowHeight - 6 }, () => manager.go('puzzleGame', { puzzleId: puzzle.id }), !unlocked);
    });
    drawLabel(ctx, '首过 ★★★ · 重试 ★★ · 提示 ★ · 末手也计步', width / 2, height - 78, 'center', { size: 10, color: COLORS.inkMuted, maxWidth: width - 32 });
    drawButton(ctx, input, { x: 20, y: height - 62, width: width - 40, height: 44, text: '返回首页', variant: 'secondary', onTap: () => manager.go('home') });
  }
}
module.exports = PuzzleListScene;
