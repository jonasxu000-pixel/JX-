const roomService = require('../../services/roomService');

class CloudClient {
  constructor(wxApi) {
    this.wx = wxApi;
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
