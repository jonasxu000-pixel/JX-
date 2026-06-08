const roomService = require('../../services/roomService');

Page({
  data: {
    roomId: '',
    created: false,
    loading: false,
    testing: false,
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

  onSelfTestMove() {
    if (this.data.loading || this.data.testing) return;

    this.setData({ testing: true });
    wx.showLoading({ title: '云端自检中...' });

    roomService.selfTestMove()
      .then(() => {
        wx.hideLoading();
        wx.showToast({
          title: '云端自检通过',
          icon: 'success',
          duration: 1800,
        });
      })
      .catch(err => {
        console.error('云端自检失败:', err);
        wx.hideLoading();
        wx.showModal({
          title: '云端自检失败',
          content: err.message || '请查看 roomAction 最新日志',
          showCancel: false,
        });
      })
      .finally(() => {
        this.setData({ testing: false });
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
