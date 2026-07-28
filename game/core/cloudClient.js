const roomService = require('../../services/roomService');

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

  createRoom() {
    return roomService.createRoom();
  }

  joinRoom(roomId) {
    return roomService.joinRoom(roomId);
  }

  getRoom(roomId) {
    return roomService.getRoom(roomId);
  }

  watchRoom(roomId, onChange, onError) {
    return roomService.watchRoom(roomId, onChange, onError);
  }

  placePiece(roomId, row, col) {
    return roomService.placePiece(roomId, row, col);
  }

  restartRoom(roomId) {
    return roomService.restartRoom(roomId);
  }

  leaveRoom(roomId) {
    return roomService.leaveRoom(roomId);
  }
}

module.exports = CloudClient;
