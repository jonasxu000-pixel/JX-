const progress = require('../../utils/progressStore');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard } = require('../renderers/cardRenderer');
const { drawPageHeader, drawProgressBar } = require('../renderers/practiceRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');

class GrowthScene {
  constructor(runtime) { this.runtime = runtime; this.tab = 'goals'; this.page = 0; this.saveError = false; }
  render(ctx, input) {
    const { width, wx, manager } = this.runtime;
    const height = this.runtime.height - Math.max(0, (this.runtime.bottomInset || 18) - 18);
    const top = getContentTop(wx);
    const data = progress.read(wx);
    const rank = progress.level(data);
    const total = progress.totals(data);
    drawPageHeader(ctx, width, top, '我的成长', '把每一局的进步，留在这里。');
    drawCard(ctx, { x: 20, y: top + 90, width: width - 40, height: 88, fill: COLORS.jade, stroke: '#345343' });
    drawLabel(ctx, rank.title, 36, top + 113, 'left', { bold: true, size: 19, color: '#FFF9EA' });
    drawLabel(ctx, `${data.xp} 修习值${rank.next ? ` / ${rank.next}` : ' · 满级'}`, width - 36, top + 113, 'right', { size: 11, color: '#D8B56E' });
    drawProgressBar(ctx, 36, top + 131, width - 72, rank.ratio, true);
    drawLabel(ctx, `人机 ${total.played} 局 · 获胜 ${total.wins} 局 · 残局 ${total.cleared}/24`, 36, top + 154, 'left', { size: 12, color: '#BECEBC' });
    const gap = 8; const tabWidth = (width - 40 - gap) / 2;
    [['goals','成长目标'],['history','最近战绩']].forEach(([id, title], index) => {
      drawButton(ctx, input, { x: 20 + index * (tabWidth + gap), y: top + 192, width: tabWidth, height: 40, text: title, fontSize: 12, variant: this.tab === id ? 'primary' : 'gold', onTap: () => { this.tab = id; this.page = 0; manager.render(); } });
    });
    const contentTop = top + 244;
    const pageSize = Math.max(1, Math.min(5, Math.floor((height - contentTop - 122) / 52)));
    {
      const list = this.tab === 'goals' ? progress.goals(data) : data.history;
      const pages = Math.max(1, Math.ceil(list.length / pageSize));
      this.page = Math.min(this.page, pages - 1);
      if (!list.length) {
        drawLabel(ctx, '第一份战绩，从下一盘开始。', width / 2, contentTop + 35, 'center', { bold: true, size: 16 });
        drawButton(ctx, input, { x: 40, y: contentTop + 62, width: width - 80, height: 44, text: '去练一局', onTap: () => manager.go('aiGame') });
      }
      list.slice(this.page * pageSize, (this.page + 1) * pageSize).forEach((item, index) => {
        const y = contentTop + index * 52;
        drawCard(ctx, { x: 20, y, width: width - 40, height: 46, radius: 12, shadow: false });
        drawLabel(ctx, item.title, 34, y + 14, 'left', { bold: true, size: 13, maxWidth: width - 140 });
        if (this.tab === 'goals') {
          drawLabel(ctx, item.note, 34, y + 33, 'left', { size: 10, color: COLORS.inkMuted });
          drawLabel(ctx, item.done ? '已达成' : `${Math.min(item.value, item.target)}/${item.target}`, width - 34, y + 23, 'right', { size: 12, bold: true, color: item.done ? COLORS.jade : COLORS.gold });
        } else {
          const date = new Date(item.at);
          drawLabel(ctx, Number.isFinite(date.getTime()) ? `${date.getMonth() + 1} 月 ${date.getDate()} 日 · +${item.earned} 修习值` : '本机战绩', 34, y + 33, 'left', { size: 10, color: COLORS.inkMuted });
          drawLabel(ctx, { win: '获胜', loss: '落败', draw: '和棋' }[item.outcome] || '完成', width - 34, y + 23, 'right', { bold: true, size: 12, color: item.outcome === 'win' ? COLORS.jade : COLORS.inkMuted });
        }
      });
      if (pages > 1) {
        drawButton(ctx, input, { x: 20, y: height - 112, width: 76, height: 38, text: '上一页', fontSize: 12, variant: 'gold', disabled: this.page === 0, onTap: () => { this.page -= 1; manager.render(); } });
        drawLabel(ctx, `${this.page + 1} / ${pages}`, width / 2, height - 93, 'center', { size: 12, color: COLORS.inkMuted });
        drawButton(ctx, input, { x: width - 96, y: height - 112, width: 76, height: 38, text: '下一页', fontSize: 12, variant: 'gold', disabled: this.page >= pages - 1, onTap: () => { this.page += 1; manager.render(); } });
      }
    }
    if (this.saveError) drawLabel(ctx, '本机存储暂不可用，设置未保存', width / 2, height - 72, 'center', { size: 11, color: COLORS.danger });
    drawButton(ctx, input, { x: 20, y: height - 62, width: width - 40, height: 44, text: '返回首页', variant: 'secondary', onTap: () => manager.go('home') });
  }
}
module.exports = GrowthScene;
