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
    drawPageHeader(ctx, width, top, '游戏设置', '声音和反馈，按你的习惯来。');
    const rows = [
      ['sound','volume-2','落子音效','棋子落下时的声音'],
      ['music','music','背景音乐','轻声伴奏，默认关闭'],
      ['vibration','vibrate','落子震动','仅自己落子时轻震一下'],
      ['motion','sparkles','大厅动效','短暂的棋子入场动作'],
    ];
    const rowHeight = Math.min(68, (height - top - (this.runtime.bottomInset || 18) - 220) / 4);
    drawCard(ctx, { x: 20, y: top + 88, width: width - 40, height: rowHeight * 4, radius: 20, fill: '#FAF4E8', stroke: '#DDCFB6', shadow: false });
    rows.forEach(([key, icon, title, subtitle], index) => {
      const y = top + 88 + index * rowHeight;
      drawIcon(ctx, icon, 36, y + rowHeight / 2 - 12, 23, '#5E7A65');
      drawLabel(ctx, title, 74, y + rowHeight / 2 - 10, 'left', { bold: true, size: 15 });
      drawLabel(ctx, subtitle, 74, y + rowHeight / 2 + 12, 'left', { size: 10, color: '#97866B', maxWidth: width - 174 });
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
      if (index < 3) { ctx.beginPath(); ctx.moveTo(74, y + rowHeight); ctx.lineTo(width - 36, y + rowHeight); ctx.strokeStyle = '#E6DCCB'; ctx.lineWidth = 1; ctx.stroke(); }
    });
    const bottom = height - (this.runtime.bottomInset || 18);
    drawButton(ctx,input,{x:20,y:top+100+rowHeight*4,width:width-40,height:42,text:'对局计时与悔棋规则',variant:'gold',fontSize:13,onTap:()=>manager.go('matchSetup',{mode:'settings'})});
    drawLabel(ctx, this.saveError ? '本机存储暂不可用，设置未保存' : '设置与成长记录保存在本机', width / 2, bottom - 66, 'center', { size: 11, color: this.saveError ? '#A83232' : '#97866B' });
    drawButton(ctx, input, { x: 20, y: bottom - 48, width: width - 40, height: 44, text: '返回大厅', variant: 'secondary', onTap: () => manager.go('home') });
  }
}
module.exports = SettingsScene;
