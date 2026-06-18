/**
 * Room service: client wrapper for cloud room operations.
 */

function assertCloudResult(res, fallbackMessage) {
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || fallbackMessage);
  }
  return res.result;
}

function createRoom() {
  return wx.cloud.callFunction({
    name: 'roomAction',
    data: { action: 'createRoom' },
  }).then(res => assertCloudResult(res, '创建失败').roomId);
}

function joinRoom(roomId) {
  return wx.cloud.callFunction({
    name: 'roomAction',
    data: { action: 'joinRoom', roomId },
  }).then(res => {
    const result = assertCloudResult(res, '加入失败');
    return {
      roomId,
      role: result.role,
      color: result.color,
    };
  });
}

function watchRoom(roomId, callback, errorCallback) {
  const db = wx.cloud.database();

  return db.collection('rooms').doc(roomId).watch({
    onChange(snapshot) {
      if (snapshot.docs && snapshot.docs.length > 0) {
        const roomData = snapshot.docs[0];
        const type = snapshot.docChanges && snapshot.docChanges[0]
          ? snapshot.docChanges[0].dataType
          : 'init';
        callback(roomData, type);
      } else {
        const type = snapshot.docChanges && snapshot.docChanges[0]
          ? snapshot.docChanges[0].dataType
          : 'remove';
        callback(null, type);
      }
    },
    onError(err) {
      if (errorCallback) {
        errorCallback(err);
      } else {
        console.error('房间监听错误:', err);
      }
    },
  });
}

function getRoom(roomId) {
  const db = wx.cloud.database();
  return db.collection('rooms').doc(roomId).get().then(res => res.data);
}

function placePiece(roomId, row, col) {
  return wx.cloud.callFunction({
    name: 'roomAction',
    data: { action: 'placePiece', roomId, row, col },
  }).then(res => assertCloudResult(res, '落子失败'));
}

function restartRoom(roomId) {
  return wx.cloud.callFunction({
    name: 'roomAction',
    data: { action: 'restartRoom', roomId },
  }).then(res => assertCloudResult(res, '再来一局失败'));
}

function leaveRoom(roomId) {
  return wx.cloud.callFunction({
    name: 'roomAction',
    data: { action: 'leaveRoom', roomId },
  }).then(res => {
    assertCloudResult(res, '离开失败');
  });
}

function getOpenId() {
  return wx.cloud.callFunction({
    name: 'login',
  }).then(res => res.result.openid);
}

module.exports = {
  createRoom,
  joinRoom,
  watchRoom,
  getRoom,
  placePiece,
  restartRoom,
  leaveRoom,
  getOpenId,
};
