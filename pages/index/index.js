// pages/index/index.js - 首页
Page({
  /**
   * 点击开始游戏，跳转到游戏页面
   */
  onStartGame() {
    wx.navigateTo({
      url: '/pages/game/game',
    });
  },
});
