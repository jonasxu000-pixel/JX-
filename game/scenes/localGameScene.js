const board = require('../../utils/board');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');

class LocalGameScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.board = board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.history = [];
    this.boardRect = null;
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    this.boardRect = boardRenderer.getBoardRect(width, 116);
    const statusText = this.resultText || `轮到${board.pieceName(this.currentPlayer)}落子`;

    drawLabel(ctx, '本机双人对战', 20, 38, 'left', { bold: true, size: 18 });
    drawPill(ctx, {
      x: width - 114,
      y: 24,
      width: 94,
      text: '同屏轮流',
      fill: COLORS.goldSoft,
      color: '#79551D',
    });
    drawLabel(ctx, statusText, width / 2, 82, 'center', {
      bold: true,
      color: this.gameOver ? COLORS.jade : COLORS.ink,
    });
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);

    if (this.gameOver) {
      drawCard(ctx, {
        x: 20,
        y: this.boardRect.y + this.boardRect.height + 14,
        width: width - 40,
        height: 104,
        fill: COLORS.surface,
      });
      drawLabel(ctx, this.getResultTitle(), width / 2, this.boardRect.y + this.boardRect.height + 38, 'center', {
        bold: true,
        size: 17,
        color: COLORS.jade,
      });
    }

    drawButton(ctx, input, {
      x: 24,
      y: this.boardRect.y + this.boardRect.height + (this.gameOver ? 54 : 24),
      width: (width - 64) / 2,
      height: 46,
      text: '重新开始',
      onTap: () => this.restart(),
    });

    drawButton(ctx, input, {
      x: 40 + (width - 64) / 2,
      y: this.boardRect.y + this.boardRect.height + (this.gameOver ? 54 : 24),
      width: (width - 64) / 2,
      height: 46,
      text: '返回首页',
      variant: 'ghost',
      onTap: () => manager.go('home'),
    });
  }

  handleTouch(x, y) {
    if (this.gameOver || !this.boardRect) return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) return;

    const piece = this.currentPlayer;
    this.board[grid.row][grid.col] = piece;
    this.lastMove = { row: grid.row, col: grid.col, piece };
    this.history.push(this.lastMove);

    if (board.checkWin(this.board, grid.row, grid.col, piece)) {
      this.gameOver = true;
      this.resultText = `${board.pieceName(piece)}获胜`;
    } else if (this.isFull()) {
      this.gameOver = true;
      this.resultText = '和棋';
    } else {
      this.currentPlayer = piece === board.BLACK ? board.WHITE : board.BLACK;
    }

    this.runtime.manager.render();
  }

  isFull() {
    return this.board.every(row => row.every(piece => piece !== board.EMPTY));
  }

  getResultTitle() {
    if (this.resultText === '和棋') return '势均力敌，本局和棋';
    return `${this.resultText}，漂亮收官！`;
  }

  restart() {
    this.board = board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.history = [];
    this.runtime.manager.render();
  }
}

module.exports = LocalGameScene;
