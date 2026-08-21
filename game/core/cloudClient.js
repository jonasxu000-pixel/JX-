const roomService = require('../../services/roomService');
const { getPublicPlayerProfile, getStoredPlayer } = require('../../utils/playerSession');

class CloudClient {
  constructor(wxApi) {
    this.wx = wxApi;
    this.warmUpStarted = false;
  }

  warmUp() {
    if (this.warmUpStarted) return Promise.resolve();
    this.warmUpStarted = true;

    const cloud = this.wx && this.wx.cloud;
    if (!cloud || typeof cloud.callFunction !== 'function') {
      return Promise.resolve();
    }

    return cloud.callFunction({
      name: 'roomAction',
      data: { action: 'ping' },
    }).then(() => undefined);
  }

  login() {
    const cloud = this.wx && this.wx.cloud;
    if (!cloud || typeof cloud.callFunction !== 'function') {
      return Promise.reject(new Error('当前环境暂不支持微信登录'));
    }
    return cloud.callFunction({ name: 'login' }).then(res => {
      const openId = res && res.result && res.result.openid;
      if (!openId) throw new Error('微信身份获取失败');
      return openId;
    });
  }

  createRoom() {
    return roomService.createRoom(this.getPlayerProfile());
  }

  joinRoom(roomId) {
    return roomService.joinRoom(roomId, this.getPlayerProfile());
  }

  getRoom(viewId) {
    return roomService.getRoom(viewId);
  }

  watchRoom(viewId, onChange, onError) {
    return roomService.watchRoom(viewId, onChange, onError);
  }

  placePiece(roomId, row, col) {
    return roomService.placePiece(roomId, row, col);
  }

  restartRoom(roomId) {
    return roomService.restartRoom(roomId);
  }

  surrenderRoom(roomId) {
    return roomService.surrenderRoom(roomId);
  }

  leaveRoom(roomId) {
    return roomService.leaveRoom(roomId);
  }

  getPlayerProfile() {
    return getPublicPlayerProfile(getStoredPlayer(this.wx));
  }
}

module.exports = CloudClient;
