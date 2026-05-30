// pages/index/index.js - 首页
Page({
  /**
   * 单机对战
   */
  onStartGame() {
    wx.navigateTo({
      url: '/pages/game/game',
    });
  },

  /**
   * 创建房间
   */
  onCreateRoom() {
    wx.navigateTo({
      url: '/pages/room/create',
    });
  },

  /**
   * 加入房间
   */
  onJoinRoom() {
    wx.navigateTo({
      url: '/pages/room/join',
    });
  },
});
