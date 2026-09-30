const puzzles = require('../../utils/puzzles');
const progress = require('../../utils/progressStore');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard } = require('../renderers/cardRenderer');
const { drawPageHeader, drawProgressBar } = require('../renderers/practiceRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');

class PuzzleListScene {
  constructor(runtime) { this.runtime = runtime; this.chapter = 0; }
  onEnter() {
    const data = progress.read(this.runtime.wx);
    const next = puzzles.PUZZLES.findIndex(puzzle => !data.puzzles[puzzle.id]);
    this.chapter = next < 0 ? 2 : Math.floor(next / 4);
  }
  render(ctx, input) {
    const { width, manager, wx } = this.runtime;
    const height = this.runtime.height - Math.max(0, (this.runtime.bottomInset || 18) - 18);
    const top = getContentTop(wx);
    const data = progress.read(wx);
    const cleared = Object.keys(data.puzzles).length;
    drawPageHeader(ctx, width, top, '残局挑战', '看见机会，学会制造机会。');
    drawProgressBar(ctx, 20, top + 90, width - 40, cleared / 12);
    drawLabel(ctx, `${cleared} / 12 已通关 · 首次通关 +25 修习值`, 20, top + 108, 'left', { size: 11, color: COLORS.inkMuted });
    const gap = 8; const tabWidth = (width - 40 - gap * 2) / 3;
    puzzles.CHAPTERS.forEach((title, index) => {
      drawButton(ctx, input, { x: 20 + index * (tabWidth + gap), y: top + 130, width: tabWidth, height: 40, text: title, fontSize: 12, variant: index === this.chapter ? 'primary' : 'gold', onTap: () => { this.chapter = index; manager.render(); } });
    });
    const startY = top + 186;
    const rowHeight = Math.min(70, (height - startY - 96) / 4);
    puzzles.PUZZLES.slice(this.chapter * 4, this.chapter * 4 + 4).forEach((puzzle, offset) => {
      const index = this.chapter * 4 + offset;
      const unlocked = puzzles.isUnlocked(index, data);
      const stars = data.puzzles[puzzle.id] || 0;
      const y = startY + offset * rowHeight;
      drawCard(ctx, { x: 20, y, width: width - 40, height: rowHeight - 8, radius: 14, shadow: false, fill: unlocked ? COLORS.surface : COLORS.surfaceMuted });
      drawLabel(ctx, String(index + 1).padStart(2, '0'), 34, y + (rowHeight - 8) / 2, 'left', { bold: true, size: 20, color: unlocked ? COLORS.gold : '#A5AA9F' });
      drawLabel(ctx, puzzle.title, 72, y + (rowHeight - 8) * 0.34, 'left', { bold: true, size: 15, color: unlocked ? COLORS.ink : COLORS.inkMuted });
      drawLabel(ctx, unlocked ? `${puzzle.moves} 步内取胜` : '通关上一题后解锁', 72, y + (rowHeight - 8) * 0.73, 'left', { size: 10, color: COLORS.inkMuted });
      drawLabel(ctx, stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : (unlocked ? '挑战 →' : '待解锁'), width - 34, y + (rowHeight - 8) / 2, 'right', { bold: true, size: 12, color: unlocked ? COLORS.gold : COLORS.inkMuted });
      input.addHitArea({ x: 20, y, width: width - 40, height: rowHeight - 8 }, () => manager.go('puzzleGame', { puzzleId: puzzle.id }), !unlocked);
    });
    drawLabel(ctx, '不看提示首过 ★★★ · 重试 ★★ · 使用提示 ★', width / 2, height - 78, 'center', { size: 10, color: COLORS.inkMuted, maxWidth: width - 32 });
    drawButton(ctx, input, { x: 20, y: height - 62, width: width - 40, height: 44, text: '返回首页', variant: 'secondary', onTap: () => manager.go('home') });
  }
}
module.exports = PuzzleListScene;
