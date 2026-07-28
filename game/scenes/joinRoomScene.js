const { drawButton } = require('../renderers/buttonRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { extractRoomId, readClipboardText, showToast } = require('../../utils/clipboard');

class JoinRoomScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.roomId = '';
    this.loading = false;
    this.error = '';
    this.feedback = '';
    this.pasting = false;
    this.active = true;
  }

  onEnter() {
    this.active = true;
  }

  onExit() {
    this.active = false;
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const buttonWidth = Math.min(width - 64, 280);
    const x = (width - buttonWidth) / 2;

    drawTitle(ctx, '加入房间', width / 2, 62);
    drawSubtitle(ctx, '粘贴或输入 6 位房间号', width / 2, 98);

    this.renderRoomIdSlots(ctx);

    drawButton(ctx, input, {
      x,
      y: 196,
      width: buttonWidth,
      height: 44,
      text: this.pasting ? '正在读取剪贴板...' : '一键粘贴房间号',
      disabled: this.pasting || this.loading,
      fill: '#295f92',
      onTap: () => this.pasteRoomId(),
    });

    this.renderKeypad(ctx, input);

    if (this.error || this.feedback) {
      drawLabel(ctx, this.error || this.feedback, width / 2, 470, 'center');
    }

    drawButton(ctx, input, {
      x,
      y: 494,
      width: buttonWidth,
      height: 50,
      text: this.loading ? '加入中...' : '加入房间',
      disabled: this.loading || this.roomId.length !== 6,
      onTap: () => this.joinRoom(),
    });

    drawButton(ctx, input, {
      x,
      y: 558,
      width: buttonWidth,
      height: 50,
      text: '返回首页',
      fill: '#777777',
      onTap: () => manager.go('home'),
    });
  }

  renderRoomIdSlots(ctx) {
    const { width } = this.runtime;
    const gap = 8;
    const slotWidth = Math.min(48, (width - 48 - gap * 5) / 6);
    const slotHeight = 56;
    const startX = (width - slotWidth * 6 - gap * 5) / 2;
    const y = 122;

    for (let index = 0; index < 6; index += 1) {
      const digit = this.roomId[index] || '';
      const x = startX + index * (slotWidth + gap);
      ctx.fillStyle = digit ? '#edf4fa' : '#ffffff';
      ctx.fillRect(x, y, slotWidth, slotHeight);
      ctx.strokeStyle = digit ? '#295f92' : '#c7d1cc';
      ctx.lineWidth = digit ? 2 : 1;
      ctx.strokeRect(x, y, slotWidth, slotHeight);
      ctx.fillStyle = digit ? '#22342d' : '#c1cbc6';
      ctx.font = digit ? 'bold 28px sans-serif' : '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(digit || '—', x + slotWidth / 2, y + slotHeight / 2);
    }
  }

  renderKeypad(ctx, input) {
    const { width } = this.runtime;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '退格', '0', '清空'];
    const keyWidth = Math.min(86, (width - 72) / 3);
    const gap = 12;
    const startX = (width - keyWidth * 3 - gap * 2) / 2;
    const startY = 264;

    keys.forEach((key, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      drawButton(ctx, input, {
        x: startX + col * (keyWidth + gap),
        y: startY + row * 48,
        width: keyWidth,
        height: 38,
        text: key,
        fill: /^[0-9]$/.test(key) ? '#e0b564' : '#888888',
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

  pasteRoomId() {
    if (this.pasting || this.loading) return;
    this.pasting = true;
    this.error = '';
    this.feedback = '正在读取剪贴板...';
    this.runtime.manager.render();

    readClipboardText(this.runtime.wx)
      .then(text => {
        if (!this.active) return;
        const roomId = extractRoomId(text);
        if (!roomId) {
          throw new Error('剪贴板中没有有效的 6 位房间号');
        }
        this.roomId = roomId;
        this.feedback = `已粘贴房间号 ${roomId}`;
        showToast(this.runtime.wx, '房间号已粘贴', 'success');
      })
      .catch(err => {
        if (!this.active) return;
        this.error = err.message || '读取剪贴板失败';
        this.feedback = '';
        showToast(this.runtime.wx, '房间号无效');
      })
      .finally(() => {
        this.pasting = false;
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
