const board = require('../../utils/board');
const gomokuAi = require('../../utils/gomokuAi');
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

const AI_THINK_DELAY = 460;

class AiGameScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.board = board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.aiThinking = false;
    this.aiTimer = null;
    this.active = true;
    this.boardRect = null;
    this.resultReveal = createResultReveal(runtime, () => runtime.manager.render());
  }

  onEnter() {
    this.active = true;
  }

  onHide() {
    this.clearAiTimer();
  }

  onResume() {
    if (!this.gameOver && this.currentPlayer === board.WHITE) this.scheduleAiMove();
  }

  onExit() {
    this.active = false;
    this.clearAiTimer();
    this.resultReveal.dispose();
  }

  getLayout() {
    const safeTop = getContentTop(this.runtime.wx);
    const boardTop = safeTop + 66;
    const controlsSpace = 82;
    const maxBoardSize = Math.max(220, this.runtime.height - boardTop - controlsSpace);
    return {
      safeTop,
      boardTop,
      maxBoardSize,
    };
  }

  render(ctx, input) {
    const { width, height, manager } = this.runtime;
    const layout = this.getLayout();
    this.boardRect = boardRenderer.getBoardRect(width, layout.boardTop, layout.maxBoardSize);

    drawLabel(ctx, '人机对战', 20, layout.safeTop + 12, 'left', {
      bold: true,
      size: 18,
    });
    drawPill(ctx, {
      x: width - 154,
      y: layout.safeTop - 2,
      width: 134,
      height: 32,
      text: '你执黑 · AI 执白',
      fill: COLORS.jadeSoft,
      color: COLORS.jade,
    });
    drawLabel(ctx, this.getStatusText(), width / 2, layout.safeTop + 48, 'center', {
      bold: true,
      color: this.aiThinking ? COLORS.gold : (this.gameOver ? COLORS.jade : COLORS.ink),
    });

    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);

    if (!this.gameOver) {
      const gap = 16;
      const buttonY = this.boardRect.y + this.boardRect.height + 18;
      const buttonWidth = (width - 48 - gap) / 2;
      drawButton(ctx, input, {
        x: 24,
        y: buttonY,
        width: buttonWidth,
        height: 46,
        text: '重新开始',
        onTap: () => this.restart(),
      });
      drawButton(ctx, input, {
        x: 24 + buttonWidth + gap,
        y: buttonY,
        width: buttonWidth,
        height: 46,
        text: '返回首页',
        variant: 'secondary',
        onTap: () => manager.go('home'),
      });
    }

    if (this.gameOver && this.resultReveal.isVisible()) {
      drawResultOverlay(ctx, input, {
        width,
        height,
        safeTop: layout.safeTop,
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

  getStatusText() {
    if (this.resultText) return this.resultText;
    if (this.aiThinking) return '棋遇 AI 思考中…';
    return '轮到你落子（黑棋）';
  }

  handleTouch(x, y) {
    if (this.gameOver
      || this.aiThinking
      || this.currentPlayer !== board.BLACK
      || !this.boardRect) return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) return;

    this.placeMove(grid.row, grid.col, board.BLACK);
    if (this.finishAfterMove(grid.row, grid.col, board.BLACK, '你获胜')) return;

    this.currentPlayer = board.WHITE;
    this.aiThinking = true;
    this.runtime.manager.render();
    this.scheduleAiMove();
  }

  scheduleAiMove(delay = AI_THINK_DELAY) {
    if (!this.active || this.gameOver || this.currentPlayer !== board.WHITE || this.aiTimer) return;
    this.aiThinking = true;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this.performAiMove();
    }, delay);
  }

  clearAiTimer() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
  }

  performAiMove() {
    this.clearAiTimer();
    if (!this.active || this.gameOver || this.currentPlayer !== board.WHITE) return null;

    const move = gomokuAi.selectMove(this.board, board.WHITE, board.BLACK);
    this.aiThinking = false;
    if (!move) {
      this.finishGame('和棋');
      return null;
    }

    this.placeMove(move.row, move.col, board.WHITE);
    if (!this.finishAfterMove(move.row, move.col, board.WHITE, 'AI 获胜')) {
      this.currentPlayer = board.BLACK;
      this.runtime.manager.render();
    }
    return move;
  }

  placeMove(row, col, piece) {
    this.board[row][col] = piece;
    this.lastMove = { row, col, piece };
  }

  finishAfterMove(row, col, piece, winText) {
    if (board.checkWin(this.board, row, col, piece)) {
      this.finishGame(winText);
      return true;
    }
    if (gomokuAi.isBoardFull(this.board)) {
      this.finishGame('和棋');
      return true;
    }
    return false;
  }

  finishGame(resultText) {
    this.clearAiTimer();
    this.aiThinking = false;
    this.gameOver = true;
    this.resultText = resultText;
    this.resultReveal.show();
    this.runtime.manager.render();
  }

  getResultPresentation() {
    if (this.resultText === '和棋') {
      return {
        badge: '和',
        badgeFill: COLORS.gold,
        title: '本局和棋',
        subtitle: '势均力敌',
        color: '#765622',
        note: '再来一局仍由你执黑先行',
        noteFill: COLORS.goldSoft,
        noteColor: '#765622',
      };
    }
    const playerWon = this.resultText === '你获胜';
    return {
      badge: playerWon ? '胜' : '负',
      badgeFill: playerWon ? COLORS.jade : COLORS.danger,
      title: playerWon ? '你获胜' : 'AI 获胜',
      subtitle: playerWon ? '漂亮，这一局拿下了' : '稳住阵脚，再来一盘',
      color: playerWon ? COLORS.jade : COLORS.danger,
      note: '再来一局仍由你执黑先行',
      noteFill: playerWon ? COLORS.jadeSoft : COLORS.dangerSoft,
      noteColor: playerWon ? COLORS.jade : COLORS.danger,
      winner: playerWon ? 'black' : 'white',
    };
  }

  getResultPlayers() {
    const winner = this.getResultPresentation().winner;
    return [
      {
        nickname: '你',
        label: '黑棋 · 先手',
        piece: 'black',
        isSelf: true,
        isWinner: winner === 'black',
      },
      {
        nickname: '棋遇 AI',
        label: '白棋 · 后手',
        piece: 'white',
        isWinner: winner === 'white',
      },
    ];
  }

  restart() {
    this.clearAiTimer();
    this.resultReveal.hide();
    this.board = board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.aiThinking = false;
    this.runtime.manager.render();
  }
}

AiGameScene.AI_THINK_DELAY = AI_THINK_DELAY;

module.exports = AiGameScene;
