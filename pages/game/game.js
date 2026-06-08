const board = require('../../utils/board');
const roomService = require('../../services/roomService');

function roleToPiece(role) {
  return role === 'host' ? board.BLACK : board.WHITE;
}

function pieceToRole(piece) {
  return piece === board.BLACK ? 'host' : 'guest';
}

function roleName(role, myRole) {
  if (!role) return '';
  return role === myRole ? '你' : '对手';
}

Page({
  data: {
    board: {
      BLACK: board.BLACK,
      WHITE: board.WHITE,
    },
    currentPlayer: board.BLACK,
    statusText: '黑棋落子',
    gameOver: false,
    resultText: '',
    isOnline: false,
    roomId: '',
    role: '',
    color: '',
    isMyTurn: true,
    syncing: false,
    boardLocked: false,
  },

  _boardComp: null,
  _watcher: null,
  _leaving: false,

  onLoad(options = {}) {
    if (!options.roomId) return;

    const role = options.role || 'host';
    this.setData({
      isOnline: true,
      roomId: options.roomId,
      role,
      color: options.color || (role === 'host' ? 'black' : 'white'),
      currentPlayer: board.BLACK,
      statusText: '正在同步房间...',
      isMyTurn: false,
      syncing: true,
      boardLocked: true,
    });
  },

  onReady() {
    this._boardComp = this.selectComponent('#board');

    if (this.data.isOnline) {
      this._loadRoom();
      this._startRoomWatch();
    }
  },

  onUnload() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }

    if (this.data.isOnline && this.data.roomId && !this._leaving) {
      this._leaving = true;
      roomService.leaveRoom(this.data.roomId).catch(err => {
        console.error('离开房间失败:', err);
      });
    }
  },

  _loadRoom() {
    roomService.getRoom(this.data.roomId)
      .then(roomData => this._applyRoomData(roomData))
      .catch(err => {
        console.error('读取房间失败:', err);
        wx.showToast({ title: '房间同步失败', icon: 'none' });
        this.setData({ syncing: false });
      });
  },

  _startRoomWatch() {
    if (this._watcher) this._watcher.close();

    this._watcher = roomService.watchRoom(this.data.roomId, (roomData) => {
      this._applyRoomData(roomData);
    });
  },

  _applyRoomData(roomData) {
    if (!roomData) {
      this.setData({
        gameOver: true,
        statusText: '房间已不存在',
        resultText: '房间已不存在',
        isMyTurn: false,
        syncing: false,
        boardLocked: true,
      });
      return;
    }

    const currentPlayer = roleToPiece(roomData.currentTurn || 'host');
    const isFinished = roomData.status === 'finished';
    const isWaiting = roomData.status === 'waiting';
    const isMyTurn = roomData.status === 'playing'
      && roomData.currentTurn === this.data.role
      && !roomData.winner;

    let statusText = '';
    let resultText = '';

    if (isFinished) {
      statusText = `${roleName(roomData.winner, this.data.role)}获胜`;
      resultText = statusText;
    } else if (isWaiting) {
      statusText = '对手已离开';
      resultText = '对手已离开房间';
    } else if (isMyTurn) {
      statusText = `轮到你落子（${board.pieceName(currentPlayer)}）`;
    } else {
      statusText = '等待对手落子';
    }

    this.setData({
      currentPlayer,
      statusText,
      resultText,
      gameOver: isFinished || isWaiting,
      isMyTurn,
      syncing: false,
      boardLocked: isFinished || isWaiting || !isMyTurn,
    });

    if (this._boardComp) {
      this._boardComp.syncBoard(roomData.board, roomData.lastMove, currentPlayer);
    }
  },

  _onPiecePlaced(e) {
    const { row, col, piece } = e.detail;

    if (!this.data.isOnline) {
      const nextPlayer = piece === board.BLACK ? board.WHITE : board.BLACK;
      this.setData({
        currentPlayer: nextPlayer,
        statusText: `${board.pieceName(nextPlayer)}落子`,
      });
      return;
    }

    if (!this.data.isMyTurn || this.data.syncing) {
      this._loadRoom();
      return;
    }

    const expectedRole = pieceToRole(piece);
    if (expectedRole !== this.data.role) {
      this._loadRoom();
      return;
    }

    this.setData({
      syncing: true,
      isMyTurn: false,
      boardLocked: true,
      statusText: '同步落子中...',
    });

    roomService.placePiece(this.data.roomId, row, col)
      .catch(err => {
        wx.showToast({ title: err.message || '落子失败', icon: 'none' });
      })
      .finally(() => {
        this._loadRoom();
      });
  },

  _onWin(e) {
    if (this.data.isOnline) {
      const { row, col } = e.detail;
      this.setData({
        syncing: true,
        isMyTurn: false,
        boardLocked: true,
        statusText: '同步胜负中...',
      });
      roomService.placePiece(this.data.roomId, row, col)
        .catch(err => {
          wx.showToast({ title: err.message || '落子失败', icon: 'none' });
        })
        .finally(() => {
          this._loadRoom();
        });
      return;
    }

    const { piece } = e.detail;
    this.setData({
      gameOver: true,
      resultText: `${board.pieceName(piece)} 获胜！`,
      boardLocked: true,
    });

    wx.showModal({
      title: '游戏结束',
      content: `${board.pieceName(piece)} 获胜！`,
      confirmText: '再来一局',
      showCancel: false,
      success: () => {
        this._restartGame();
      },
    });
  },

  _onUndo() {
    if (this.data.isOnline) return;
    if (!this._boardComp || !this._boardComp.canUndo()) return;

    wx.showModal({
      title: '悔棋',
      content: '确定要悔棋吗？',
      success: (res) => {
        if (!res.confirm) return;

        const last = this._boardComp.undo();
        if (!last) return;

        this.setData({
          currentPlayer: last.piece,
          statusText: `${board.pieceName(last.piece)}落子`,
        });
      },
    });
  },

  _onRestart() {
    if (this.data.isOnline) return;

    wx.showModal({
      title: '重新开始',
      content: '确定要重新开始吗？',
      success: (res) => {
        if (res.confirm) {
          this._restartGame();
        }
      },
    });
  },

  _restartGame() {
    this.setData({
      currentPlayer: board.BLACK,
      statusText: '黑棋落子',
      gameOver: false,
      resultText: '',
      boardLocked: false,
    });
    if (this._boardComp) {
      this._boardComp.resetBoard();
    }
  },
});
