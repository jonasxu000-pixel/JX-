const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill, roundedRectPath } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');
const { extractRoomId, readClipboardText } = require('../../utils/clipboard');

class JoinRoomScene {
  constructor(runtime, params) {
    this.runtime = runtime;
    this.roomId = extractRoomId(params && params.roomId);
    this.source = (params && params.source) || '';
    this.loading = false;
    this.error = '';
    this.feedback = this.roomId ? '已读取好友邀请，请确认房间号' : '正在识别剪贴板中的房间号';
    this.checkingClipboard = false;
    this.active = false;
  }

  onEnter() {
    this.active = true;
    if (!this.roomId) this.autoFillFromClipboard();
  }

  onExit() {
    this.active = false;
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const layout = this.getLayout();
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '加入好友房', width / 2, layout.titleY);
    drawSubtitle(ctx, '确认房间号，和好友马上开局', width / 2, layout.subtitleY);

    this.renderRoomIdSlots(ctx, layout);

    this.renderKeypad(ctx, input, layout);

    if (this.error || this.feedback) {
      drawPill(ctx, {
        x: width / 2 - 126,
        y: layout.feedbackY,
        width: 252,
        height: 30,
        text: this.error || this.feedback,
      fill: this.error ? COLORS.dangerSoft : COLORS.jadeSoft,
        color: this.error ? COLORS.danger : COLORS.jade,
      });
    }

    drawButton(ctx, input, {
      x,
      y: layout.confirmY,
      width: buttonWidth,
      height: layout.actionHeight,
      text: this.loading ? '正在加入...' : '确认加入房间',
      disabled: this.loading || this.roomId.length !== 6,
      onTap: () => this.joinRoom(),
    });

    drawButton(ctx, input, {
      x,
      y: layout.backY,
      width: buttonWidth,
      height: layout.actionHeight,
      text: '返回首页',
      variant: 'ghost',
      onTap: () => manager.go('home'),
    });

    drawSubtitle(ctx, '已复制房间号时，进入本页会自动识别', width / 2, layout.footerY);
  }

  getLayout() {
    if (this.runtime.height < 620) {
      return {
        titleY: 82,
        subtitleY: 108,
        cardY: 118,
        cardHeight: 88,
        slotY: 152,
        slotHeight: 42,
        keypadY: 214,
        keypadStep: 40,
        keyHeight: 38,
        feedbackY: 378,
        confirmY: 414,
        backY: 466,
        actionHeight: 44,
        footerY: 538,
      };
    }
    return {
      titleY: 52,
      subtitleY: 84,
      cardY: 108,
      cardHeight: 98,
      slotY: 148,
      slotHeight: 46,
      keypadY: 226,
      keypadStep: 48,
      keyHeight: 40,
      feedbackY: 426,
      confirmY: 474,
      backY: 538,
      actionHeight: 50,
      footerY: 620,
    };
  }

  renderRoomIdSlots(ctx, layout) {
    const { width } = this.runtime;
    const cardX = 20;
    const cardY = layout.cardY;
    const cardWidth = width - 40;
    drawCard(ctx, {
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: layout.cardHeight,
    });
    drawLabel(ctx, '房间号（6 位数字）', cardX + 18, cardY + 24, 'left', {
      size: 12,
      color: COLORS.inkMuted,
    });

    const gap = 7;
    const slotWidth = Math.min(42, (cardWidth - 36 - gap * 5) / 6);
    const slotHeight = layout.slotHeight;
    const startX = (width - slotWidth * 6 - gap * 5) / 2;
    const y = layout.slotY;

    for (let index = 0; index < 6; index += 1) {
      const digit = this.roomId[index] || '';
      const x = startX + index * (slotWidth + gap);
      roundedRectPath(ctx, x, y, slotWidth, slotHeight, 10);
      ctx.fillStyle = digit ? COLORS.blueSoft : COLORS.surfaceMuted;
      ctx.fill();
      ctx.strokeStyle = digit ? COLORS.blue : COLORS.line;
      ctx.lineWidth = digit ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (digit) ctx.fillText(digit, x + slotWidth / 2, y + slotHeight / 2);
    }
  }

  renderKeypad(ctx, input, layout) {
    const { width } = this.runtime;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '退格', '0', '清空'];
    const keyWidth = Math.min(88, (width - 68) / 3);
    const gap = 10;
    const startX = (width - keyWidth * 3 - gap * 2) / 2;
    const startY = layout.keypadY;

    keys.forEach((key, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      drawButton(ctx, input, {
        x: startX + col * (keyWidth + gap),
        y: startY + row * layout.keypadStep,
        width: keyWidth,
        height: layout.keyHeight,
        text: key,
        variant: /^[0-9]$/.test(key) ? 'gold' : 'ghost',
        fontSize: /^[0-9]$/.test(key) ? 18 : 14,
        onTap: () => this.handleKey(key),
      });
    });
  }

  handleKey(key) {
    this.error = '';
    this.feedback = '';
    if (/^[0-9]$/.test(key) && this.roomId.length < 6) {
      this.roomId += key;
    } else if (key === '退格') {
      this.roomId = this.roomId.slice(0, -1);
    } else if (key === '清空') {
      this.roomId = '';
    }
    this.runtime.manager.render();
  }

  autoFillFromClipboard() {
    if (this.checkingClipboard || this.loading) return;
    this.checkingClipboard = true;
    readClipboardText(this.runtime.wx)
      .then(text => {
        if (!this.active) return;
        const roomId = extractRoomId(text);
        if (!roomId) {
          this.feedback = '未识别到房间号，也可以手动输入';
          return;
        }
        this.roomId = roomId;
        this.feedback = '已从剪贴板识别房间号，请确认加入';
      })
      .catch(() => {
        if (!this.active) return;
        this.feedback = '可直接输入好友发来的 6 位房间号';
      })
      .finally(() => {
        this.checkingClipboard = false;
        if (this.active) this.runtime.manager.render();
      });
  }

  joinRoom() {
    if (this.loading || this.roomId.length !== 6) return;
    this.loading = true;
    this.error = '';
    this.runtime.manager.render();

    this.runtime.cloud.joinRoom(this.roomId)
      .then(result => {
        if (!this.active) return;
        this.runtime.manager.go('waitRoom', {
          roomId: this.roomId,
          viewId: result.viewId,
          role: result.role,
          color: result.color,
        });
      })
      .catch(err => {
        if (!this.active) return;
        this.error = err.message || '加入失败';
      })
      .finally(() => {
        if (!this.active) return;
        this.loading = false;
        this.runtime.manager.render();
      });
  }
}

module.exports = JoinRoomScene;
