const puzzles = require('../../utils/puzzles');
const progress = require('../../utils/progressStore');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard } = require('../renderers/cardRenderer');
const { drawPageHeader, drawProgressBar } = require('../renderers/practiceRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');

const TRACKS = [
  ['tutorial', '入门 1~2手', '先认识战术，再挑战更长的攻杀链。', 0],
  ['challenge', '进阶 3~7手', '连续攻杀，推演守方的每次应手。', 3],
  ['master', '大师 绝杀', 'VCT 伏杀、绝境反杀、长链与连珠禁手。', 6],
];

class PuzzleListScene {
  constructor(runtime, params = {}) {
    this.runtime = runtime;
    this.track = ['tutorial', 'challenge', 'master'].includes(params.track) ? params.track : 'challenge';
    this.chapter = this.track === 'master' ? 6 : this.track === 'tutorial' ? 0 : 3;
    this.explicitTrack = Boolean(params.track);
  }

  onEnter() {
    if (this.explicitTrack) return;
    const data = progress.read(this.runtime.wx);
    const nextChallenge = puzzles.CHALLENGES.find(puzzle => !data.puzzles[puzzle.id]);
    if (nextChallenge) {
      this.track = 'challenge';
      this.chapter = nextChallenge.chapter - 1;
      return;
    }
    const nextMaster = (puzzles.MASTERS || []).find(puzzle => !data.puzzles[puzzle.id]);
    if (nextMaster) {
      this.track = 'master';
      this.chapter = nextMaster.chapter - 1;
      return;
    }
    this.track = 'master';
    this.chapter = 8;
  }

  render(ctx, input) {
    const { width, manager, wx } = this.runtime;
    const height = this.runtime.height - Math.max(0, (this.runtime.bottomInset || 18) - 18);
    const top = getContentTop(wx);
    const compact = height - top < 470;
    const data = progress.read(wx);
    const trackMeta = TRACKS.find(item => item[0] === this.track) || TRACKS[1];
    const list = this.track === 'master'
      ? (puzzles.MASTERS || [])
      : this.track === 'challenge'
        ? puzzles.CHALLENGES
        : puzzles.TUTORIALS;
    const cleared = list.filter(puzzle => data.puzzles[puzzle.id]).length;

    drawPageHeader(ctx, width, top, '残局挑战', trackMeta[2]);

    const trackGap = 6;
    const trackWidth = (width - 40 - trackGap * 2) / 3;
    const trackY = top + (compact ? 76 : 82);
    TRACKS.forEach(([id, title, , baseChapter], i) => {
      drawButton(ctx, input, {
        x: 20 + i * (trackWidth + trackGap),
        y: trackY,
        width: trackWidth,
        height: 38,
        text: title,
        fontSize: width < 350 ? 11 : 12,
        variant: this.track === id ? 'primary' : 'gold',
        onTap: () => {
          this.track = id;
          this.chapter = baseChapter;
          manager.render();
        },
      });
    });

    const barY = top + (compact ? 119 : 128);
    drawProgressBar(ctx, 20, barY, width - 40, list.length ? cleared / list.length : 0);
    drawLabel(ctx, `${cleared}/${list.length} 已通关 · 每章首题可直接挑战`, 20, barY + 13, 'left', {
      size: 10,
      color: COLORS.inkMuted,
    });

    const gap = 8;
    const tabWidth = (width - 40 - gap * 2) / 3;
    const base = trackMeta[3];
    const chapterY = top + (compact ? 145 : 154);
    puzzles.CHAPTERS.slice(base, base + 3).forEach((title, i) => {
      const index = base + i;
      drawButton(ctx, input, {
        x: 20 + i * (tabWidth + gap),
        y: chapterY,
        width: tabWidth,
        height: 38,
        text: title,
        fontSize: width < 350 ? 11 : 12,
        variant: index === this.chapter ? 'primary' : 'gold',
        onTap: () => {
          this.chapter = index;
          manager.render();
        },
      });
    });

    const startY = top + (compact ? 190 : 204);
    const rowHeight = Math.max(44, Math.min(70, (height - startY - 82) / 4));
    puzzles.PUZZLES.slice(this.chapter * 4, this.chapter * 4 + 4).forEach((puzzle, offset) => {
      const index = this.chapter * 4 + offset;
      const unlocked = puzzles.isUnlocked(index, data);
      const stars = data.puzzles[puzzle.id] || 0;
      const y = startY + offset * rowHeight;
      const cardHeight = rowHeight - 6;
      drawCard(ctx, {
        x: 20,
        y,
        width: width - 40,
        height: cardHeight,
        radius: 14,
        shadow: false,
        fill: unlocked ? COLORS.surface : COLORS.surfaceMuted,
      });
      drawLabel(ctx, String(list.indexOf(puzzle) + 1).padStart(2, '0'), 34, y + cardHeight / 2, 'left', {
        bold: true,
        size: compact ? 18 : 20,
        color: unlocked ? COLORS.gold : '#A5AA9F',
      });
      drawLabel(ctx, puzzle.title, 72, y + cardHeight * 0.34, 'left', {
        bold: true,
        size: compact ? 14 : 15,
        color: unlocked ? COLORS.ink : COLORS.inkMuted,
        maxWidth: width - 160,
      });
      const note = unlocked
        ? `${puzzle.tag ? `${puzzle.tag} · ` : ''}${puzzle.moves} 手内取胜`
        : '先通关本章上一题';
      drawLabel(ctx, note, 72, y + cardHeight * 0.75, 'left', {
        size: 10,
        color: puzzle.ruleSet === 'renju' && unlocked ? COLORS.danger : COLORS.inkMuted,
        maxWidth: width - 150,
      });
      drawLabel(
        ctx,
        stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : (unlocked ? '挑战 →' : '待解锁'),
        width - 34,
        y + cardHeight / 2,
        'right',
        { bold: true, size: 12, color: unlocked ? COLORS.gold : COLORS.inkMuted },
      );
      input.addHitArea(
        { x: 20, y, width: width - 40, height: cardHeight },
        () => manager.go('puzzleGame', { puzzleId: puzzle.id }),
        !unlocked,
      );
    });

    drawLabel(
      ctx,
      '首过 ★★★ · 退步/重试 ★★ · 提示 ★ · 末手也计步',
      width / 2,
      height - 76,
      'center',
      { size: 10, color: COLORS.inkMuted, maxWidth: width - 32 },
    );
    drawButton(ctx, input, {
      x: 20,
      y: height - 62,
      width: width - 40,
      height: 44,
      text: '返回首页',
      variant: 'secondary',
      onTap: () => manager.go('home'),
    });
  }
}

module.exports = PuzzleListScene;
