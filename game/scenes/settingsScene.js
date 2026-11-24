const progress = require('../../utils/progressStore');
const { drawCard, roundedRectPath } = require('../renderers/cardRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawPageHeader } = require('../renderers/practiceRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawIcon } = require('../renderers/iconRenderer');
const { getContentTop } = require('../../utils/safeArea');

class SettingsScene {
  constructor(runtime) { this.runtime = runtime; this.saveError = false; }
  render(ctx, input) {
    const { width, height, wx, manager, feedback } = this.runtime;
    const top = getContentTop(wx); const data = progress.read(wx);
    const bottom = height - (this.runtime.bottomInset || 18);
    const compact = bottom - top < 470;
    drawPageHeader(ctx, width, top, '游戏设置', '声音和反馈，按你的习惯来。');
    const rows = [
      ['sound','volume-2','落子音效','棋子落下时的声音'],
      ['music','music','背景音乐','轻声伴奏，默认关闭'],
      ['vibration','vibrate','落子震动','仅自己落子时轻震一下'],
      ['motion','sparkles','大厅动效','短暂的棋子入场动作'],
      ['confirmMove','crosshair','落子确认','点击预选虚线落点，再点确认'],
    ];
    const cardY = top + (compact ? 82 : 88);
    const backHeight = compact ? 42 : 44;
    const backY = bottom - (compact ? 44 : 48);
    const ruleHeight = compact ? 38 : 42;
    const maxCardBottom = backY - 24 - ruleHeight - (compact ? 8 : 12);
    const rowHeight = Math.max(42, Math.min(60, Math.floor((maxCardBottom - cardY) / rows.length)));
    drawCard(ctx, { x: 20, y: cardY, width: width - 40, height: rowHeight * rows.length, radius: 20, fill: '#FAF4E8', stroke: '#DDCFB6', shadow: false });
    rows.forEach(([key, icon, title, subtitle], index) => {
      const y = cardY + index * rowHeight;
      drawIcon(ctx, icon, 36, y + rowHeight / 2 - 11, 22, '#5E7A65');
      drawLabel(ctx, title, 74, y + rowHeight / 2 - (compact ? 8 : 10), 'left', { bold: true, size: compact ? 14 : 15 });
      drawLabel(ctx, subtitle, 74, y + rowHeight / 2 + (compact ? 10 : 12), 'left', { size: 10, color: '#97866B', maxWidth: width - 174 });
      const rect = { x: width - 92, y: y + (rowHeight - 44) / 2, width: 60, height: 44 };
      const enabled = data.settings[key];
      ctx.save(); roundedRectPath(ctx, rect.x, rect.y + 8, rect.width, 28, 14); ctx.fillStyle = enabled ? '#438777' : '#D8D0C1'; ctx.fill();
      ctx.beginPath(); ctx.arc(rect.x + (enabled ? 45 : 15), rect.y + 22, 11, 0, Math.PI * 2); ctx.fillStyle = '#FFFCF1'; ctx.fill(); ctx.restore();
      input.addHitArea({ x: 20, y, width: width - 40, height: rowHeight }, () => {
        this.saveError = !progress.setSetting(wx, key, !enabled);
        if (feedback && feedback.syncMusic) feedback.syncMusic();
        if (key === 'sound' && !enabled && feedback) feedback.move(false);
        manager.render();
      });
      if (index < rows.length - 1) { ctx.beginPath(); ctx.moveTo(74, y + rowHeight); ctx.lineTo(width - 36, y + rowHeight); ctx.strokeStyle = '#E6DCCB'; ctx.lineWidth = 1; ctx.stroke(); }
    });
    drawButton(ctx,input,{x:20,y:cardY+(compact?8:12)+rowHeight*rows.length,width:width-40,height:ruleHeight,text:'对局计时与悔棋规则',variant:'gold',fontSize:13,onTap:()=>manager.go('matchSetup',{mode:'settings'})});
    drawLabel(ctx, this.saveError ? '本机存储暂不可用，设置未保存' : '设置与成长记录保存在本机', width / 2, backY - 16, 'center', { size: 11, color: this.saveError ? '#A83232' : '#97866B' });
    drawButton(ctx, input, { x: 20, y: backY, width: width - 40, height: backHeight, text: '返回大厅', variant: 'secondary', onTap: () => manager.go('home') });
  }
}
module.exports = SettingsScene;
