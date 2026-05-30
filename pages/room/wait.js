// pages/room/wait.js - 房间等待页面
Page({
  data: {
    roomId: '',
    role: 'host',
    waiting: true,
  },

  onLoad(options) {
    this.setData({
      roomId: options.roomId || '000000',
      role: options.role || 'host',
    });
  },

  /**
   * 复制房间号
   */
  onCopyRoomId() {
    wx.setClipboardData({
      data: this.data.roomId,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success',
          duration: 1500,
        });
      },
    });
  },

  /**
   * 模拟对手加入（临时）
   */
  onSimulateJoin() {
    wx.showModal({
      title: '提示',
      content: '对手已加入房间（模拟）',
      showCancel: false,
      success: () => {
        this.setData({ waiting: false });
        // 跳转到游戏页面
        wx.redirectTo({
          url: '/pages/game/game',
        });
      },
    });
  },

  /**
   * 返回首页
   */
  onBack() {
    wx.navigateBack({
      delta: 2,
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      },
    });
  },
});
