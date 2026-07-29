const board = require('../../utils/board');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawPill } = require('../renderers/cardRenderer');
const {
  createResultReveal,
  drawResultOverlay,
} = require('../renderers/resultOverlayRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');

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
    this.resultReveal = createResultReveal(runtime, () => runtime.manager.render());
  }

  onExit() {
    this.resultReveal.dispose();
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

    if (!this.gameOver) {
      drawButton(ctx, input, {
        x: 24,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 64) / 2,
        height: 46,
        text: '重新开始',
        onTap: () => this.restart(),
      });

      drawButton(ctx, input, {
        x: 40 + (width - 64) / 2,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 64) / 2,
        height: 46,
        text: '返回首页',
        variant: 'secondary',
        onTap: () => manager.go('home'),
      });
    }

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

    if (this.gameOver) this.resultReveal.show();
    this.runtime.manager.render();
  }

  isFull() {
    return this.board.every(row => row.every(piece => piece !== board.EMPTY));
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
    const blackWon = this.resultText === '黑棋获胜';
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
    this.runtime.manager.render();
  }
}

module.exports = LocalGameScene;
