// pages/room/create.js - 创建房间页面
const room = require('../../utils/room');

Page({
  data: {
    roomId: '',
    created: false,
  },

  /**
   * 点击创建房间
   */
  onCreateRoom() {
    const roomId = room.generateRoomId();
    this.setData({
      roomId,
      created: true,
    });

    wx.vibrateShort();
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
   * 进入等待页面
   */
  onEnterWait() {
    wx.navigateTo({
      url: `/pages/room/wait?roomId=${this.data.roomId}&role=host`,
    });
  },

  /**
   * 返回首页
   */
  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      },
    });
  },
});
