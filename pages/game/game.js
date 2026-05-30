// pages/game/game.js - 游戏页面
const board = require('../../utils/board');

Page({
  data: {
    currentPlayer: board.BLACK,
    statusText: '黑棋落子',
  },

  onLoad() {
    console.log('Game page loaded');
  },

  /**
   * 接收棋盘落子事件
   */
  _onPiecePlaced(e) {
    const { row, col, piece } = e.detail;
    console.log(`落子: (${row}, ${col})`);

    // 切换玩家
    const nextPlayer = piece === board.BLACK ? board.WHITE : board.BLACK;
    this.setData({
      currentPlayer: nextPlayer,
      statusText: `${board.pieceName(nextPlayer)}落子`,
    });
  },
});
