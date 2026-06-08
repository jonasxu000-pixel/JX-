const roomService = require('../../services/roomService');

Page({
  data: {
    roomId: '',
    role: 'host',
    waiting: true,
    color: 'black',
  },

  onLoad(options = {}) {
    this.setData({
      roomId: options.roomId || '000000',
      role: options.role || 'host',
      color: options.color || 'black',
    });

    this._startWatch();
  },

  _startWatch() {
    const { roomId } = this.data;

    this._watcher = roomService.watchRoom(roomId, (roomData) => {
      if (!roomData) {
        wx.showToast({ title: '房间已关闭', icon: 'none' });
        wx.reLaunch({ url: '/pages/index/index' });
        return;
      }

      if (roomData.status === 'playing') {
        this.setData({ waiting: false });
        wx.redirectTo({
          url: `/pages/game/game?roomId=${roomId}&role=${this.data.role}&color=${this.data.color}`,
        });
      }
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

  onBack() {
    wx.showModal({
      title: '确认离开',
      content: '离开后将退出当前房间',
      success: (res) => {
        if (!res.confirm) return;

        if (this._watcher) {
          this._watcher.close();
          this._watcher = null;
        }

        roomService.leaveRoom(this.data.roomId).finally(() => {
          wx.navigateBack({
            delta: 1,
            fail: () => {
              wx.reLaunch({ url: '/pages/index/index' });
            },
          });
        });
      },
    });
  },

  onUnload() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  },
});
