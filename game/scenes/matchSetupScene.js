const progress = require('../../utils/progressStore');
const rules = require('../../utils/matchRules');
const { drawPageHeader } = require('../renderers/practiceRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawCard } = require('../renderers/cardRenderer');
const { getContentTop } = require('../../utils/safeArea');
class MatchSetupScene {
  constructor(runtime, params = {}) {
    this.runtime = runtime;
    this.mode = params.mode || 'settings';
    this.difficulty = params.difficulty;
    this.rules = rules.normalize(
      params.rules || rules.fromSettings(progress.read(runtime.wx).settings),
    );
  }
  render(ctx, input) {
    const { width, height, wx, manager } = this.runtime;
    const top = getContentTop(wx);
    const bottom = height - (this.runtime.bottomInset || 18);
    const compact = bottom - top < 430;
    drawPageHeader(
      ctx,
      width,
      top,
      '对局规则',
      this.mode === 'friend'
        ? '建房前确定，加入的好友沿用房间规则。'
        : '选择计时和悔棋方式，开局后保持一致。',
    );
    drawCard(ctx, {
      x: 20,
      y: top + 88,
      width: width - 40,
      height: compact ? 170 : 186,
      fill: '#FAF1DF',
      stroke: '#D3B98C',
      shadow: false,
    });
    drawLabel(ctx, '每步用时', 36, top + 111, 'left', { bold: true, size: 16 });
    const gap = 6;
    const w = (width - 72) / 4;
    rules.TURN_OPTIONS.forEach((seconds, i) =>
      drawButton(ctx, input, {
        x: 32 + i * (w + gap),
        y: top + 133,
        width: w,
        height: 40,
        text: seconds ? `${seconds} 秒` : '不限时',
        fontSize: 12,
        variant: this.rules.turnSeconds === seconds ? 'primary' : 'gold',
        onTap: () => {
          this.rules.turnSeconds = seconds;
          manager.render();
        },
      }),
    );
    drawButton(ctx, input, {
      x: 32,
      y: top + (compact ? 180 : 192),
      width: width - 64,
      height: 44,
      text: `悔棋：${this.rules.allowUndo ? '允许，每方最多两次' : '不允许'}`,
      variant: 'secondary',
      fontSize: 14,
      onTap: () => {
        this.rules.allowUndo = !this.rules.allowUndo;
        manager.render();
      },
    });
    const notes =
      this.mode === 'ai'
        ? ['人机悔棋退回上一轮黑白两手。', 'AI 思考不占用你的时限。']
        : this.mode === 'local'
          ? ['同屏撤回上一手，需要另一方确认。', '悔棋等待计时，撤回后不补回已用时间。']
          : ['轮到你时可申请，退回上一轮黑白两手。', '须对手同意，每方两次申请，15 秒未回应拒绝。'];
    drawLabel(ctx, notes[0], 24, top + (compact ? 276 : 298), 'left', {
      size: 11,
      color: '#7E6848',
      maxWidth: width - 48,
    });
    drawLabel(
      ctx,
      compact ? '计时对局切后台继续，超时判负。' : notes[1],
      24,
      top + (compact ? 299 : 320),
      'left',
      { size: 11, color: '#7E6848', maxWidth: width - 48 },
    );
    if (!compact)
      drawLabel(ctx, '计时对局切后台继续计时，超时判负。', 24, top + 342, 'left', {
        size: 11,
        color: '#7E6848',
        maxWidth: width - 48,
      });
    const primary =
      this.mode === 'friend'
        ? '创建好友房'
        : this.mode === 'settings'
          ? '保存默认规则'
          : '开始对弈';
    drawButton(ctx, input, {
      x: 20,
      y: bottom - 106,
      width: width - 40,
      height: 44,
      text: primary,
      onTap: () => {
        const timeSaved = progress.setSetting(wx, 'turnSeconds', this.rules.turnSeconds);
        const undoSaved = progress.setSetting(wx, 'undoEnabled', this.rules.allowUndo);
        const saved = timeSaved && undoSaved;
        if (!saved && wx.showToast)
          wx.showToast({ title: '默认规则未保存，本次对局仍可使用', icon: 'none' });
        manager.go(
          this.mode === 'friend'
            ? 'createRoom'
            : this.mode === 'local'
              ? 'localGame'
              : this.mode === 'ai'
                ? 'aiGame'
                : 'settings',
          { rules: this.rules, difficulty: this.difficulty },
        );
      },
    });
    drawButton(ctx, input, {
      x: 20,
      y: bottom - 52,
      width: width - 40,
      height: 44,
      text: this.mode === 'settings' ? '返回设置' : '返回大厅',
      variant: 'gold',
      onTap: () => manager.go(this.mode === 'settings' ? 'settings' : 'home'),
    });
  }
}
module.exports = MatchSetupScene;
