// pages/room/join.js - 加入房间页面
const room = require('../../utils/room');

Page({
  data: {
    inputRoomId: '',
  },

  /**
   * 输入房间号
   */
  onInputRoomId(e) {
    this.setData({
      inputRoomId: e.detail.value.replace(/\D/g, '').slice(0, 6),
    });
  },

  /**
   * 点击加入房间
   */
  onJoinRoom() {
    const { inputRoomId } = this.data;

    if (!room.isValidRoomId(inputRoomId)) {
      wx.showToast({
        title: '请输入6位房间号',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/room/wait?roomId=${inputRoomId}&role=guest`,
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
