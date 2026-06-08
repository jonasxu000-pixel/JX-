const roomService = require('../../services/roomService');

Page({
  data: {
    roomId: '',
    created: false,
    loading: false,
  },

  onCreateRoom() {
    if (this.data.loading || this.data.created) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '创建中...' });

    roomService.createRoom()
      .then(roomId => {
        wx.hideLoading();
        this.setData({
          roomId,
          created: true,
        });
        wx.vibrateShort();
      })
      .catch(err => {
        console.error('创建房间失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: err.message || '创建失败，请重试',
          icon: 'none',
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

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

  onEnterWait() {
    if (!this.data.roomId) return;

    wx.navigateTo({
      url: `/pages/room/wait?roomId=${this.data.roomId}&role=host&color=black`,
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      },
    });
  },
});
