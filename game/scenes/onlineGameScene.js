const board = require('../../utils/board');
const onlineGameState = require('../../utils/onlineGameState');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');

class OnlineGameScene {
  constructor(runtime, params) {
    this.runtime = runtime;
    this.roomId = params.roomId;
    this.role = params.role || 'host';
    this.color = params.color || (this.role === 'host' ? 'black' : 'white');
    this.board = board.createBoard();
    this.lastMove = null;
    this.currentPlayer = board.BLACK;
    this.statusText = '正在同步房间...';
    this.resultText = '';
    this.gameOver = false;
    this.shouldShowResult = false;
    this.isMyTurn = false;
    this.boardLocked = true;
    this.syncing = false;
    this.moveSubmitting = false;
    this.restartSubmitting = false;
    this.watcher = null;
    this.restartTimer = null;
    this.boardRect = null;
    this.active = false;
  }

  onEnter() {
    this.active = true;
    this.loadRoom();
    this.startWatch();
  }

  onResume() {
    this.active = true;
    this.loadRoom();
    this.startWatch();
  }

  onExit() {
    this.active = false;
    this.clearWatch();
    this.clearRestart();
  }

  loadRoom() {
    return this.runtime.cloud.getRoom(this.roomId)
      .then(roomData => {
        if (this.active) this.applyRoom(roomData);
      })
      .catch(err => {
        if (!this.active) return;
        this.statusText = err.message || '房间同步失败';
        this.syncing = false;
        this.runtime.manager.render();
      });
  }

  startWatch() {
    if (!this.active) return;
    this.clearWatch();
    this.clearRestart();
    this.watcher = this.runtime.cloud.watchRoom(
      this.roomId,
      roomData => {
        if (this.active) this.applyRoom(roomData);
      },
      () => {
        if (this.active) this.scheduleRestart();
      },
    );
  }

  applyRoom(roomData) {
    if (!this.active) return;
    const viewState = onlineGameState.deriveOnlineGameState(roomData, this.role);
    this.currentPlayer = viewState.currentPlayer;
    this.statusText = viewState.statusText;
    this.resultText = viewState.resultText;
    this.gameOver = viewState.gameOver;
    this.shouldShowResult = viewState.shouldShowResult;
    this.isMyTurn = viewState.isMyTurn;
    this.boardLocked = viewState.boardLocked;
    this.syncing = false;
    this.moveSubmitting = false;

    if (roomData && Array.isArray(roomData.board)) {
      this.board = normalizeBoard(roomData.board);
      this.lastMove = roomData.lastMove || null;
    }

    this.runtime.manager.render();
  }

  scheduleRestart() {
    if (!this.active || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.active) return;
      this.loadRoom().finally(() => this.startWatch());
    }, 1000);
  }

  clearWatch() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  }

  clearRestart() {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  render(ctx, input) {
    const { width } = this.runtime;
    this.boardRect = boardRenderer.getBoardRect(width, 122);
    const roleText = this.role === 'host' ? '黑棋' : '白棋';

    drawLabel(ctx, `房间 ${this.roomId} · 你执${roleText}`, 24, 42);
    drawLabel(ctx, this.syncing ? '正在同步...' : this.statusText, width / 2, 82, 'center');
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);

    if (this.shouldShowResult) {
      this.renderResultActions(ctx, input);
    } else {
      drawButton(ctx, input, {
        x: (width - 240) / 2,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: 240,
        height: 46,
        text: '返回首页',
        fill: '#777777',
        onTap: () => this.leaveToHome(),
      });
    }
  }

  renderResultActions(ctx, input) {
    const { width } = this.runtime;
    const y = this.boardRect.y + this.boardRect.height + 24;
    drawLabel(ctx, this.resultText, width / 2, y - 18, 'center');

    drawButton(ctx, input, {
      x: 24,
      y,
      width: (width - 64) / 2,
      height: 46,
      text: this.restartSubmitting ? '处理中...' : '再来一局',
      disabled: this.restartSubmitting,
      fill: '#295f92',
      onTap: () => this.restartRoom(),
    });

    drawButton(ctx, input, {
      x: 40 + (width - 64) / 2,
      y,
      width: (width - 64) / 2,
      height: 46,
      text: '返回首页',
      fill: '#777777',
      onTap: () => this.leaveToHome(),
    });
  }

  handleTouch(x, y) {
    if (!this.boardRect || this.boardLocked || this.syncing || this.moveSubmitting) return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) return;

    this.moveSubmitting = true;
    this.syncing = true;
    this.boardLocked = true;
    this.statusText = '正在同步落子...';
    this.runtime.manager.render();

    this.runtime.cloud.placePiece(this.roomId, grid.row, grid.col)
      .catch(err => {
        this.statusText = err.message || '落子失败';
      })
      .finally(() => {
        this.loadRoom().finally(() => {
          this.moveSubmitting = false;
        });
      });
  }

  restartRoom() {
    if (!this.gameOver || this.restartSubmitting) return;
    this.restartSubmitting = true;
    this.syncing = true;
    this.statusText = '正在开始新对局...';
    this.runtime.manager.render();

    this.runtime.cloud.restartRoom(this.roomId)
      .catch(err => {
        this.statusText = err.message || '再来一局失败';
      })
      .finally(() => {
        this.loadRoom().finally(() => {
          this.restartSubmitting = false;
        });
      });
  }

  leaveToHome() {
    this.active = false;
    this.clearWatch();
    this.clearRestart();
    this.runtime.cloud.leaveRoom(this.roomId)
      .finally(() => this.runtime.manager.go('home'));
  }
}

function normalizeBoard(nextBoard) {
  return Array.from({ length: board.BOARD_SIZE }, (_, row) => {
    const sourceRow = Array.isArray(nextBoard[row]) ? nextBoard[row] : [];
    return Array.from({ length: board.BOARD_SIZE }, (_, col) => {
      const piece = sourceRow[col];
      return piece === board.BLACK || piece === board.WHITE ? piece : board.EMPTY;
    });
  });
}

module.exports = OnlineGameScene;
