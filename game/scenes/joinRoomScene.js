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
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '加入好友房', width / 2, 52);
    drawSubtitle(ctx, '确认房间号，和好友马上开局', width / 2, 84);

    this.renderRoomIdSlots(ctx);

    this.renderKeypad(ctx, input);

    if (this.error || this.feedback) {
      drawPill(ctx, {
        x: width / 2 - 126,
        y: 426,
        width: 252,
        height: 30,
        text: this.error || this.feedback,
        fill: this.error ? '#F5E4DF' : COLORS.jadeSoft,
        color: this.error ? COLORS.danger : COLORS.jade,
      });
    }

    drawButton(ctx, input, {
      x,
      y: 474,
      width: buttonWidth,
      height: 50,
      text: this.loading ? '正在加入...' : '确认加入房间',
      disabled: this.loading || this.roomId.length !== 6,
      onTap: () => this.joinRoom(),
    });

    drawButton(ctx, input, {
      x,
      y: 538,
      width: buttonWidth,
      height: 50,
      text: '返回首页',
      variant: 'ghost',
      onTap: () => manager.go('home'),
    });

    drawSubtitle(ctx, '已复制房间号时，进入本页会自动识别', width / 2, 620);
  }

  renderRoomIdSlots(ctx) {
    const { width } = this.runtime;
    const cardX = 20;
    const cardY = 108;
    const cardWidth = width - 40;
    drawCard(ctx, {
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: 98,
    });
    drawLabel(ctx, '房间号（6 位数字）', cardX + 18, cardY + 24, 'left', {
      size: 12,
      color: COLORS.inkMuted,
    });

    const gap = 7;
    const slotWidth = Math.min(42, (cardWidth - 36 - gap * 5) / 6);
    const slotHeight = 46;
    const startX = (width - slotWidth * 6 - gap * 5) / 2;
    const y = 148;

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

  renderKeypad(ctx, input) {
    const { width } = this.runtime;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '退格', '0', '清空'];
    const keyWidth = Math.min(88, (width - 68) / 3);
    const gap = 10;
    const startX = (width - keyWidth * 3 - gap * 2) / 2;
    const startY = 226;

    keys.forEach((key, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      drawButton(ctx, input, {
        x: startX + col * (keyWidth + gap),
        y: startY + row * 48,
        width: keyWidth,
        height: 40,
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
