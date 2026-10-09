const board = require('../../utils/board');
const gomokuRules = require('../../utils/gomokuRules');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawPill } = require('../renderers/cardRenderer');
const { createResultReveal, drawResultOverlay } = require('../renderers/resultOverlayRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');
const matchRules = require('../../utils/matchRules');
const progress = require('../../utils/progressStore');
const { drawClock, drawUndoPrompt } = require('../renderers/ruleRenderer');

class LocalGameScene {
  constructor(runtime, params = {}) {
    this.runtime = runtime;
    this.board = board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.history = [];
    this.boardRect = null;
    this.resultReveal = createResultReveal(runtime, () => runtime.manager.render());
    this.rules = matchRules.normalize(
      params.rules || matchRules.fromSettings(progress.read(runtime.wx).settings),
    );
    this.deadline = 0;
    this.active = false;
    this.undoUsed = { 1: 0, 2: 0 };
    this.pendingUndo = null;
    this.winnerPiece = null;
    this.clock = matchRules.createTicker(() => {
      if (!this.active || this.gameOver) return false;
      if (this.checkTimeout()) return false;
      if (this.pendingUndo && Date.now() >= this.pendingUndo.expiresAt) this.pendingUndo = null;
      runtime.manager.render();
      return Boolean(this.deadline || this.pendingUndo);
    });
  }

  onEnter() {
    this.active = true;
    this.beginTurn();
  }
  onHide() {
    this.active = false;
    this.clock.stop();
  }
  onResume() {
    this.active = true;
    if (!this.gameOver) this.beginTurn();
  }
  beginTurn() {
    if (!this.deadline && this.rules.turnSeconds)
      this.deadline = Date.now() + this.rules.turnSeconds * 1000;
    this.clock.start();
  }
  checkTimeout() {
    if (this.gameOver || !this.deadline || Date.now() < this.deadline) return false;
    this.winnerPiece = this.currentPlayer === board.BLACK ? board.WHITE : board.BLACK;
    this.gameOver = true;
    this.resultText = `${board.pieceName(this.currentPlayer)}超时，${board.pieceName(this.winnerPiece)}获胜`;
    this.pendingUndo = null;
    this.clock.stop();
    this.resultReveal.show();
    this.runtime.manager.render();
    return true;
  }

  onExit() {
    this.active = false;
    this.clock.stop();
    this.resultReveal.dispose();
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const safeTop = getContentTop(this.runtime.wx);
    const boardTop = safeTop + 84;
    this.boardRect = boardRenderer.getBoardRect(
      width,
      boardTop,
      this.runtime.height - boardTop - 112 - Math.max(0, (this.runtime.bottomInset || 18) - 18),
    );
    const statusText = this.resultText || `轮到${board.pieceName(this.currentPlayer)}落子`;

    drawLabel(ctx, '同屏双人对战', 20, safeTop + 14, 'left', { bold: true, size: 21 });
    drawPill(ctx, {
      x: width - 114,
      y: safeTop,
      width: 94,
      text:
        !this.history.length && !this.gameOver
          ? `规则 · ${this.rules.turnSeconds ? this.rules.turnSeconds + '秒' : '不限时'}`
          : '同屏轮流',
      fill: COLORS.goldSoft,
      color: '#79551D',
    });
    if (this.gameOver)
      drawLabel(ctx, statusText, width / 2, safeTop + 59, 'center', { bold: true, size: 15 });
    else
      drawClock(
        ctx,
        { x: 20, y: safeTop + 42, width: width - 40, height: 30 },
        statusText,
        this.deadline,
      );
    if (!this.history.length && !this.gameOver)
      input.addHitArea({ x: width - 114, y: safeTop, width: 94, height: 38 }, () =>
        manager.go('matchSetup', { mode: 'local', rules: this.rules }),
      );
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);
    drawLabel(
      ctx,
      `${matchRules.RULE_NAMES[this.rules.ruleSet]} · 黑棋先行${this.rules.openingCenter ? ' · 首手天元' : ''}`,
      width / 2,
      this.boardRect.y + this.boardRect.height + 12,
      'center',
      { size: 10, color: COLORS.inkMuted },
    );

    if (!this.gameOver) {
      drawButton(ctx, input, {
        x: 24,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 64) / 3,
        height: 46,
        text: '重开',
        fontSize: 13,
        onTap: () => this.restart(),
      });

      drawButton(ctx, input, {
        x: 40 + (2 * (width - 64)) / 3,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 64) / 3,
        height: 46,
        text: '返回大厅',
        fontSize: 13,
        variant: 'secondary',
        onTap: () => manager.go('home'),
      });
      const count = this.rules.undoScope === 'round' ? 2 : 1;
      const last = this.history[this.history.length - count];
      drawButton(ctx, input, {
        x: 32 + (width - 64) / 3,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 64) / 3,
        height: 46,
        text:
          last && this.rules.allowUndo
            ? `悔棋 ${Math.max(0, this.rules.undoLimit - this.undoUsed[last.piece])}`
            : '不可悔棋',
        fontSize: 12,
        variant: 'gold',
        disabled:
          !this.rules.allowUndo ||
          !last ||
          this.undoUsed[last.piece] >= this.rules.undoLimit ||
          Boolean(this.pendingUndo),
        onTap: () => this.requestUndo(),
      });
    }
    if (this.pendingUndo && !this.gameOver)
      drawUndoPrompt(ctx, input, this.runtime, {
        title: `${board.pieceName(this.pendingUndo.by)}申请悔棋`,
        note:
          this.pendingUndo.removeCount === 2
            ? '撤回最近一轮两手，需要另一方同意'
            : '撤回最近一手，需要另一方同意',
        detail: `剩余 ${Math.max(0, Math.ceil((this.pendingUndo.expiresAt - Date.now()) / 1000))} 秒 · 等待也计时，不补回用时`,
        onAccept: () => this.respondUndo(true),
        onReject: () => this.respondUndo(false),
      });

    if (this.gameOver && this.resultReveal.isVisible()) {
      drawResultOverlay(ctx, input, {
        width,
        height: this.runtime.height,
        safeTop: getContentTop(this.runtime.wx),
        progress: this.resultReveal.getProgress(),
        presentation: this.getResultPresentation(),
        players: this.getResultPlayers(),
        primaryAction: {
          text: '再来一局',
          onTap: () => this.restart(),
        },
        secondaryAction: {
          text: '返回首页',
          onTap: () => manager.go('home'),
        },
      });
    }
  }

  handleTouch(x, y) {
    if (this.checkTimeout()) return;
    if (this.gameOver || this.pendingUndo || !this.boardRect) return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) return;

    const piece = this.currentPlayer;
    const openingError = gomokuRules.openingError(
      this.board,
      grid.row,
      grid.col,
      piece,
      this.rules,
    );
    if (openingError) {
      if (this.runtime.wx.showToast)
        this.runtime.wx.showToast({ title: openingError, icon: 'none' });
      return;
    }
    this.board[grid.row][grid.col] = piece;
    this.lastMove = { row: grid.row, col: grid.col, piece };
    this.history.push({
      ...this.lastMove,
      at: Date.now(),
      remainingMs: this.deadline ? Math.max(0, this.deadline - Date.now()) : null,
    });
    if (this.runtime.feedback) this.runtime.feedback.move();

    const judgement = gomokuRules.adjudicate(
      this.board,
      grid.row,
      grid.col,
      piece,
      this.rules.ruleSet,
    );
    if (judgement.foul) {
      this.gameOver = true;
      this.winnerPiece = board.WHITE;
      this.resultText = `${judgement.foulText}，白棋获胜`;
    } else if (judgement.win) {
      this.gameOver = true;
      this.resultText = `${board.pieceName(piece)}获胜`;
      this.winnerPiece = piece;
    } else if (this.isFull()) {
      this.gameOver = true;
      this.resultText = '和棋';
    } else {
      this.currentPlayer = piece === board.BLACK ? board.WHITE : board.BLACK;
      this.deadline = 0;
      this.beginTurn();
    }

    if (this.gameOver) {
      this.clock.stop();
      this.resultReveal.show();
    }
    this.runtime.manager.render();
  }

  isFull() {
    return this.board.every((row) => row.every((piece) => piece !== board.EMPTY));
  }

  getResultPresentation() {
    if (this.resultText === '和棋') {
      return {
        badge: '和',
        badgeFill: COLORS.gold,
        title: '本局和棋',
        subtitle: '势均力敌',
        color: '#765622',
        note: '再来一局仍由黑棋先行',
        noteFill: COLORS.goldSoft,
        noteColor: '#765622',
      };
    }
    const blackWon = this.winnerPiece
      ? this.winnerPiece === board.BLACK
      : this.resultText === '黑棋获胜';
    return {
      badge: '胜',
      badgeFill: COLORS.jade,
      title: this.resultText,
      subtitle: '漂亮，这一局拿下了',
      color: COLORS.jade,
      note: '再来一局仍由黑棋先行',
      noteFill: COLORS.jadeSoft,
      noteColor: COLORS.jade,
      winner: blackWon ? 'black' : 'white',
    };
  }

  getResultPlayers() {
    const winner = this.getResultPresentation().winner;
    return [
      {
        nickname: '黑棋',
        label: '黑棋 · 先手',
        piece: 'black',
        isWinner: winner === 'black',
      },
      {
        nickname: '白棋',
        label: '白棋 · 后手',
        piece: 'white',
        isWinner: winner === 'white',
      },
    ];
  }

  restart() {
    this.resultReveal.hide();
    this.board = board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.history = [];
    this.clock.stop();
    this.deadline = 0;
    this.undoUsed = { 1: 0, 2: 0 };
    this.pendingUndo = null;
    this.winnerPiece = null;
    this.beginTurn();
    this.runtime.manager.render();
  }
  requestUndo() {
    const count = this.rules.undoScope === 'round' ? 2 : 1;
    const last = this.history[this.history.length - count];
    if (
      this.gameOver ||
      this.checkTimeout() ||
      !this.rules.allowUndo ||
      this.pendingUndo ||
      !last ||
      this.undoUsed[last.piece] >= this.rules.undoLimit
    )
      return;
    const now = Date.now();
    this.undoUsed[last.piece] += 1;
    this.pendingUndo = {
      by: last.piece,
      removeCount: count,
      elapsedStart: count === 2 ? this.history[this.history.length - 1].at || now : now,
      requestedAt: now,
      expiresAt: this.deadline ? Math.min(now + 15000, this.deadline) : now + 15000,
    };
    this.clock.start();
    this.runtime.manager.render();
  }
  respondUndo(accept) {
    if (this.gameOver || this.checkTimeout() || !this.pendingUndo) return;
    const pending = this.pendingUndo;
    this.pendingUndo = null;
    if (accept && Date.now() < pending.expiresAt) {
      const removed = this.history.splice(-pending.removeCount);
      const last = removed[0];
      removed.forEach((move) => {
        this.board[move.row][move.col] = board.EMPTY;
      });
      this.lastMove = this.history[this.history.length - 1] || null;
      this.currentPlayer = pending.by;
      const now = Date.now();
      const remaining = this.deadline
        ? Math.max(
            0,
            Math.min(this.deadline - now, last.remainingMs - (now - pending.elapsedStart)),
          )
        : 0;
      this.deadline = this.rules.turnSeconds ? now + remaining : 0;
    }
    if (!this.checkTimeout()) this.beginTurn();
    this.runtime.manager.render();
  }
}

module.exports = LocalGameScene;
