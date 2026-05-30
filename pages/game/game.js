// pages/game/game.js - 游戏页面
const board = require('../../utils/board');

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
  },

  // 棋盘组件引用
  _boardComp: null,

  onLoad() {
    console.log('Game page loaded');
  },

  onReady() {
    this._boardComp = this.selectComponent('#board');
  },

  /**
   * 接收棋盘落子事件，切换玩家
   */
  _onPiecePlaced(e) {
    const { piece } = e.detail;
    const nextPlayer = piece === board.BLACK ? board.WHITE : board.BLACK;
    this.setData({
      currentPlayer: nextPlayer,
      statusText: `${board.pieceName(nextPlayer)}落子`,
    });
  },

  /**
   * 接收胜负事件
   */
  _onWin(e) {
    const { piece } = e.detail;
    this.setData({
      gameOver: true,
      resultText: `${board.pieceName(piece)} 获胜！`,
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

  /**
   * 重新开始
   */
  _onRestart() {
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

  /**
   * 重置游戏状态
   */
  _restartGame() {
    this.setData({
      currentPlayer: board.BLACK,
      statusText: '黑棋落子',
      gameOver: false,
      resultText: '',
    });
    if (this._boardComp) {
      this._boardComp.resetBoard();
    }
  },
});
