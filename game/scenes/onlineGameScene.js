const board = require('../../utils/board');
const onlineGameState = require('../../utils/onlineGameState');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { COLORS } = require('../design/theme');

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
    this.restartReady = false;
    this.opponentRestartReady = false;
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

    if (roomData && roomData.status === 'waiting' && this.role === 'host') {
      this.runtime.manager.go('waitRoom', {
        roomId: this.roomId,
        role: this.role,
        color: this.color,
      });
      return;
    }

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
    const restartReady = (roomData && roomData.restartReady) || {};
    this.restartReady = Boolean(restartReady[this.role]);
    const opponentRole = this.role === 'host' ? 'guest' : 'host';
    this.opponentRestartReady = Boolean(restartReady[opponentRole]);

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

    drawLabel(ctx, `好友房 ${this.roomId}`, 20, 38, 'left', { bold: true, size: 17 });
    drawPill(ctx, {
      x: width - 102,
      y: 24,
      width: 82,
      text: `你执${roleText}`,
      fill: this.role === 'host' ? COLORS.goldSoft : COLORS.blueSoft,
      color: this.role === 'host' ? '#79551D' : COLORS.blue,
    });
    drawLabel(ctx, this.syncing ? '正在同步棋局…' : this.statusText, width / 2, 82, 'center', {
      bold: this.isMyTurn,
      color: this.isMyTurn ? COLORS.jade : COLORS.ink,
    });
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);

    if (this.shouldShowResult) {
      this.renderResultActions(ctx, input);
    } else {
      drawButton(ctx, input, {
        x: (width - 240) / 2,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: 240,
        height: 46,
        text: '退出本局',
        variant: 'ghost',
        onTap: () => this.leaveToHome(),
      });
    }
  }

  renderResultActions(ctx, input) {
    const { width } = this.runtime;
    const cardY = this.boardRect.y + this.boardRect.height + 14;
    const y = cardY + 62;
    const presentation = this.getResultPresentation();
    drawCard(ctx, {
      x: 16,
      y: cardY,
      width: width - 32,
      height: 112,
      fill: presentation.fill,
      stroke: presentation.stroke,
    });
    drawLabel(ctx, presentation.title, width / 2, cardY + 28, 'center', {
      bold: true,
      size: 17,
      color: presentation.color,
    });
    drawLabel(ctx, presentation.subtitle, width / 2, cardY + 50, 'center', {
      size: 12,
      color: COLORS.inkMuted,
    });

    drawButton(ctx, input, {
      x: 24,
      y,
      width: (width - 64) / 2,
      height: 46,
      text: this.restartSubmitting
        ? '正在确认…'
        : (this.restartReady ? '已准备，等待对手' : (this.opponentRestartReady ? '同意再来一局' : '再来一局')),
      disabled: this.restartSubmitting || this.restartReady,
      onTap: () => this.restartRoom(),
    });

    drawButton(ctx, input, {
      x: 40 + (width - 64) / 2,
      y,
      width: (width - 64) / 2,
      height: 46,
      text: '返回首页',
      variant: 'ghost',
      onTap: () => this.leaveToHome(),
    });
  }

  getResultPresentation() {
    if (this.resultText === '你获胜') {
      return {
        title: '漂亮！你赢下了这一局',
        subtitle: this.getRestartSubtitle('棋逢对手，不妨再来一盘'),
        color: COLORS.jade,
        fill: '#EFF7F2',
        stroke: '#CDE3D5',
      };
    }
    if (this.resultText === '对手获胜') {
      return {
        title: '这一局惜败，再来一盘吧',
        subtitle: this.getRestartSubtitle('复盘一手，下一局扳回来'),
        color: COLORS.danger,
        fill: '#FBF1EE',
        stroke: '#EBCFC7',
      };
    }
    return {
      title: '势均力敌，本局和棋',
      subtitle: this.getRestartSubtitle('难分高下，再战一局见真章'),
      color: '#79551D',
      fill: '#FBF5E8',
      stroke: '#E8D7B6',
    };
  }

  getRestartSubtitle(defaultText) {
    if (this.restartReady) return '你已准备，等待对手确认后自动开局';
    if (this.opponentRestartReady) return '对手已准备，等你确认是否继续';
    return defaultText;
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
    this.statusText = '正在发送再战确认…';
    this.runtime.manager.render();

    this.runtime.cloud.restartRoom(this.roomId)
      .then(result => {
        if (!this.active || !result) return;
        this.restartReady = !result.restarted;
        this.statusText = result.restarted ? '新一局开始' : '已准备，等待对手确认';
      })
      .catch(err => {
        this.statusText = err.message || '再来一局失败';
      })
      .finally(() => {
        this.restartSubmitting = false;
        if (this.active) this.loadRoom();
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
