const roomService = require('../../services/roomService');

Page({
  data: {
    inputRoomId: '',
    loading: false,
  },

  onInputRoomId(e) {
    this.setData({
      inputRoomId: e.detail.value.replace(/\D/g, '').slice(0, 6),
    });
  },

  onJoinRoom() {
    const { inputRoomId } = this.data;

    if (inputRoomId.length !== 6) {
      wx.showToast({
        title: '请输入6位房间号',
        icon: 'none',
      });
      return;
    }

    if (this.data.loading) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '加入中...' });

    roomService.joinRoom(inputRoomId)
      .then(result => {
        wx.hideLoading();
        wx.redirectTo({
          url: `/pages/room/wait?roomId=${inputRoomId}&role=${result.role}&color=${result.color}`,
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({
          title: err.message || '加入失败',
          icon: 'none',
          duration: 2000,
        });
      })
      .finally(() => {
        this.setData({ loading: false });
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
