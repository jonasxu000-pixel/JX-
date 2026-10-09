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
    // A new match upgrades a legacy preset; a running legacy room keeps its rules.
    this.rules.version = 2;
    this.advanced = false;
  }
  render(ctx, input) {
    const { width, height, wx, manager } = this.runtime;
    const top = getContentTop(wx),
      bottom = height - (this.runtime.bottomInset || 18);
    const compact = bottom - top < 500;
    drawPageHeader(
      ctx,
      width,
      top,
      '对局规则',
      this.mode === 'friend' ? '建房前确定，好友沿用房间规则。' : '轻松开局，也可以定制一局棋。',
    );
    const y = top + 88;
    const tight = bottom - 159 - y < 208;
    const redraw = () => manager.render();
    const row = (values, labels, selected, at, onSelect) => {
      const gap = 6,
        w = (width - 64 - gap * (values.length - 1)) / values.length;
      values.forEach((value, i) =>
        drawButton(ctx, input, {
          x: 32 + i * (w + gap),
          y: at,
          width: w,
          height: 38,
          text: labels[i],
          fontSize: 12,
          variant: selected === value ? 'primary' : 'gold',
          onTap: () => {
            onSelect(value);
            redraw();
          },
        }),
      );
    };
    drawCard(ctx, {
      x: 20,
      y,
      width: width - 40,
      height: Math.min(compact ? 230 : 252, bottom - 159 - y),
      fill: '#FAF1DF',
      stroke: '#D3B98C',
      shadow: false,
    });
    if (!this.advanced) {
      drawLabel(ctx, '每步用时', 36, y + (tight ? 17 : 22), 'left', { bold: true, size: 15 });
      row(
        rules.TURN_OPTIONS,
        ['不限时', '30 秒', '60 秒', '120 秒'],
        this.rules.turnSeconds,
        y + (tight ? 27 : 36),
        (value) => {
          this.rules.turnSeconds = value;
        },
      );
      drawLabel(ctx, '每方每局悔棋申请', 36, y + (tight ? 83 : 96), 'left', {
        bold: true,
        size: 15,
      });
      row(
        [0, 1, 2, 3],
        ['不允许', '1 次', '2 次', '3 次'],
        this.rules.undoLimit,
        y + (tight ? 94 : 110),
        (value) => {
          this.rules.undoLimit = value;
          this.rules.allowUndo = value > 0;
        },
      );
      drawButton(ctx, input, {
        x: 32,
        y: y + (tight ? 139 : 167),
        width: width - 64,
        height: 38,
        text: this.mode === 'ai' ? '人机对局使用自由五子棋' : '高级设置  +',
        variant: 'secondary',
        fontSize: 13,
        disabled: this.mode === 'ai',
        onTap: () => {
          this.advanced = true;
          redraw();
        },
      });
      if (!compact)
        drawLabel(ctx, '默认：30 秒 · 每方 1 次 · 无禁手', 36, y + 234, 'left', {
          size: 11,
          color: '#7E6848',
        });
    } else {
      drawLabel(
        ctx,
        compact && this.rules.ruleSet === 'renju' ? '黑棋禁手判负' : '高级设置',
        36,
        y + 22,
        'left',
        { bold: true, size: 15 },
      );
      drawButton(ctx, input, {
        x: width - 116,
        y: y + 6,
        width: 84,
        height: 38,
        text: '收起 −',
        variant: 'secondary',
        fontSize: 12,
        onTap: () => {
          this.advanced = false;
          redraw();
        },
      });
      row(
        rules.RULE_SETS,
        ['无禁手', '恰好五子', '连珠禁手'],
        this.rules.ruleSet,
        y + (tight ? 45 : 51),
        (value) => {
          this.rules.ruleSet = value;
        },
      );
      const half = (width - 70) / 2;
      drawButton(ctx, input, {
        x: 32,
        y: y + (tight ? 88 : 101),
        width: this.mode === 'local' ? width - 64 : half,
        height: 38,
        text: `首手天元：${this.rules.openingCenter ? '开' : '关'}`,
        variant: 'secondary',
        fontSize: 12,
        onTap: () => {
          this.rules.openingCenter = !this.rules.openingCenter;
          redraw();
        },
      });
      if (this.mode !== 'local')
        drawButton(ctx, input, {
          x: 38 + half,
          y: y + (tight ? 88 : 101),
          width: half,
          height: 38,
          text: `再战：${this.rules.rematch === 'loser' ? '负方先手' : '交换先手'}`,
          variant: 'secondary',
          fontSize: 12,
          onTap: () => {
            this.rules.rematch = this.rules.rematch === 'loser' ? 'alternate' : 'loser';
            redraw();
          },
        });
      if (!tight) drawLabel(ctx, '悔棋撤回范围', 36, y + 160, 'left', { size: 12, bold: true });
      row(
        ['move', 'round'],
        ['上一手', '上一轮（两手）'],
        this.rules.undoScope,
        y + (tight ? 131 : 173),
        (value) => {
          this.rules.undoScope = value;
        },
      );
      if (!compact)
        drawLabel(
          ctx,
          this.mode === 'local' ? '同屏轮流落子；黑棋先行。' : '好友首局随机；平局交换棋色。',
          36,
          y + 234,
          'left',
          {
            size: 11,
            color: '#7E6848',
          },
        );
    }
    const notesY = y + (compact ? 251 : 274);
    const ruleNote = this.advanced
      ? this.rules.ruleSet === 'renju'
        ? '黑棋三三、四四、长连判负；白棋无禁手。'
        : this.rules.ruleSet === 'exact'
          ? '双方恰好五子获胜，长连不算获胜。'
          : '双方五子及以上获胜，无禁手。'
      : this.mode === 'ai'
        ? '撤回上一轮；AI 思考不占用你的时间。'
        : this.rules.undoScope === 'round'
          ? '轮到自己时申请，撤回上一轮两手。'
          : '自己刚落子后申请，撤回最近一手。';
    if (notesY + 19 < bottom - 156) {
      drawLabel(ctx, ruleNote, 24, notesY, 'left', {
        size: 11,
        color: '#7E6848',
        maxWidth: width - 48,
      });
      if (!compact)
        drawLabel(
          ctx,
          this.advanced && this.rules.ruleSet === 'renju'
            ? '黑棋恰好五子优先获胜；不含赛事交换开局。'
            : '申请即计次数；15 秒未确认拒绝，等待不补时。',
          24,
          notesY + 23,
          'left',
          { size: 11, color: '#7E6848', maxWidth: width - 48 },
        );
    }
    drawButton(ctx, input, {
      x: 20,
      y: bottom - 151,
      width: width - 40,
      height: 38,
      text: '恢复默认：30 秒 / 1 次 / 无禁手',
      variant: 'secondary',
      fontSize: 12,
      onTap: () => {
        this.rules = rules.normalize();
        redraw();
      },
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
        if (this.mode === 'ai') {
          this.rules.ruleSet = 'freestyle';
          this.rules.openingCenter = false;
          this.rules.undoScope = 'round';
        }
        const preset =
          this.mode === 'ai'
            ? {
                ...rules.fromSettings(progress.read(wx).settings),
                turnSeconds: this.rules.turnSeconds,
                undoLimit: this.rules.undoLimit,
                allowUndo: this.rules.allowUndo,
              }
            : this.rules;
        const saved = progress.setRules(wx, preset);
        if (!saved && wx.showToast)
          wx.showToast({ title: '默认规则未保存，本次仍可使用', icon: 'none' });
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
