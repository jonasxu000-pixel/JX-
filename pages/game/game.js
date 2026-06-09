const board = require('../../utils/board');
const onlineGameState = require('../../utils/onlineGameState');
const roomService = require('../../services/roomService');

Page({
  data: {
    board: {
      BLACK: board.BLACK,
      WHITE: board.WHITE,
    },
    currentPlayer: board.BLACK,
    statusText: '\u9ed1\u68cb\u843d\u5b50',
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
  _resultShown: false,
  _moveSubmitting: false,

  onLoad(options = {}) {
    if (!options.roomId) return;

    const role = options.role || 'host';
    this.setData({
      isOnline: true,
      roomId: options.roomId,
      role,
      color: options.color || (role === 'host' ? 'black' : 'white'),
      currentPlayer: board.BLACK,
      statusText: '\u6b63\u5728\u540c\u6b65\u623f\u95f4...',
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
        console.error('\u79bb\u5f00\u623f\u95f4\u5931\u8d25:', err);
      });
    }
  },

  _loadRoom() {
    return roomService.getRoom(this.data.roomId)
      .then(roomData => this._applyRoomData(roomData))
      .catch(err => {
        console.error('\u8bfb\u53d6\u623f\u95f4\u5931\u8d25:', err);
        wx.showToast({ title: '\u623f\u95f4\u540c\u6b65\u5931\u8d25', icon: 'none' });
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
    const viewState = onlineGameState.deriveOnlineGameState(roomData, this.data.role);

    this.setData({
      currentPlayer: viewState.currentPlayer,
      statusText: viewState.statusText,
      resultText: viewState.resultText,
      gameOver: viewState.gameOver,
      isMyTurn: viewState.isMyTurn,
      syncing: false,
      boardLocked: viewState.boardLocked,
    });
    this._moveSubmitting = false;

    if (roomData && this._boardComp) {
      this._boardComp.syncBoard(roomData.board, roomData.lastMove, viewState.currentPlayer);
    }

    if (viewState.shouldShowResult) {
      this._showOnlineResultOnce(viewState.resultText);
    }
  },

  _showOnlineResultOnce(resultText) {
    if (this._resultShown) return;
    this._resultShown = true;

    wx.showModal({
      title: '\u6e38\u620f\u7ed3\u675f',
      content: resultText,
      confirmText: '\u77e5\u9053\u4e86',
      showCancel: false,
    });
  },

  _onPiecePlaced(e) {
    const { row, col, piece } = e.detail;

    if (!this.data.isOnline) {
      const nextPlayer = piece === board.BLACK ? board.WHITE : board.BLACK;
      this.setData({
        currentPlayer: nextPlayer,
        statusText: `${board.pieceName(nextPlayer)}\u843d\u5b50`,
      });
      return;
    }

    if (this._moveSubmitting || !this.data.isMyTurn || this.data.syncing) {
      this._loadRoom();
      return;
    }

    const expectedRole = onlineGameState.pieceToRole(piece);
    if (expectedRole !== this.data.role) {
      this._loadRoom();
      return;
    }

    this._moveSubmitting = true;
    this.setData({
      syncing: true,
      isMyTurn: false,
      boardLocked: true,
      statusText: '\u6b63\u5728\u540c\u6b65\u843d\u5b50...',
    });

    roomService.placePiece(this.data.roomId, row, col)
      .catch(err => {
        wx.showToast({ title: err.message || '\u843d\u5b50\u5931\u8d25', icon: 'none' });
      })
      .finally(() => {
        this._loadRoom().finally(() => {
          this._moveSubmitting = false;
        });
      });
  },

  _onWin(e) {
    if (this.data.isOnline) {
      this._loadRoom();
      return;
    }

    const { piece } = e.detail;
    const resultText = `${board.pieceName(piece)} \u83b7\u80dc\uff01`;

    this.setData({
      gameOver: true,
      resultText,
      boardLocked: true,
    });

    wx.showModal({
      title: '\u6e38\u620f\u7ed3\u675f',
      content: resultText,
      confirmText: '\u518d\u6765\u4e00\u5c40',
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
      title: '\u6094\u68cb',
      content: '\u786e\u5b9a\u8981\u6094\u68cb\u5417\uff1f',
      success: (res) => {
        if (!res.confirm) return;

        const last = this._boardComp.undo();
        if (!last) return;

        this.setData({
          currentPlayer: last.piece,
          statusText: `${board.pieceName(last.piece)}\u843d\u5b50`,
        });
      },
    });
  },

  _onRestart() {
    if (this.data.isOnline) return;

    wx.showModal({
      title: '\u91cd\u65b0\u5f00\u59cb',
      content: '\u786e\u5b9a\u8981\u91cd\u65b0\u5f00\u59cb\u5417\uff1f',
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
      statusText: '\u9ed1\u68cb\u843d\u5b50',
      gameOver: false,
      resultText: '',
      boardLocked: false,
    });
    if (this._boardComp) {
      this._boardComp.resetBoard();
    }
  },
});
