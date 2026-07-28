const board = require('../../utils/board');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');

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
    const statusText = this.resultText || `${board.pieceName(this.currentPlayer)}落子`;

    drawLabel(ctx, '本机对战', 24, 46);
    drawLabel(ctx, statusText, width / 2, 82, 'center');
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);

    drawButton(ctx, input, {
      x: 24,
      y: this.boardRect.y + this.boardRect.height + 26,
      width: (width - 64) / 2,
      height: 46,
      text: '重新开始',
      fill: '#295f92',
      onTap: () => this.restart(),
    });

    drawButton(ctx, input, {
      x: 40 + (width - 64) / 2,
      y: this.boardRect.y + this.boardRect.height + 26,
      width: (width - 64) / 2,
      height: 46,
      text: '返回首页',
      fill: '#777777',
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
