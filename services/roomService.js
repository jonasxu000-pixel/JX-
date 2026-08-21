/**
 * Room service: client wrapper for cloud room operations.
 */

const { toUserMessage } = require('../utils/userFacingError');

function assertCloudResult(res, fallbackMessage) {
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || fallbackMessage);
  }
  return res.result;
}

function callRoomAction(data, fallbackMessage) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    return Promise.reject(new Error('当前环境暂不支持云端好友房'));
  }

  return wx.cloud.callFunction({ name: 'roomAction', data })
    .then(res => assertCloudResult(res, fallbackMessage))
    .catch(err => Promise.reject(new Error(toUserMessage(err, fallbackMessage))));
}

function createRoom(playerProfile) {
  return callRoomAction({ action: 'createRoom', playerProfile }, '创建失败')
    .then(result => {
      assertViewId(result.viewId);
      return {
        roomId: result.roomId,
        viewId: result.viewId,
        role: result.role,
        color: result.color,
      };
    });
}

function joinRoom(roomId, playerProfile) {
  return callRoomAction({ action: 'joinRoom', roomId, playerProfile }, '加入失败')
    .then(result => {
      assertViewId(result.viewId);
      return {
        roomId,
        viewId: result.viewId,
        role: result.role,
        color: result.color,
      };
    });
}

function assertViewId(viewId) {
  if (!/^[a-f0-9]{36}$/i.test(String(viewId || ''))) {
    throw new Error('房间访问凭证失效，请重新进入房间');
  }
}

function watchRoom(viewId, callback, errorCallback) {
  assertViewId(viewId);
  const db = wx.cloud.database();

  return db.collection('roomViews').doc(viewId).watch({
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
        errorCallback(new Error(toUserMessage(err, '房间同步失败')));
      } else {
        console.error('房间监听错误:', err);
      }
    },
  });
}

function getRoom(viewId) {
  assertViewId(viewId);
  const db = wx.cloud.database();
  return db.collection('roomViews').doc(viewId).get()
    .then(res => res.data)
    .catch(err => Promise.reject(new Error(toUserMessage(err, '房间同步失败'))));
}

function placePiece(roomId, row, col) {
  return callRoomAction({ action: 'placePiece', roomId, row, col }, '落子失败');
}

function restartRoom(roomId) {
  return callRoomAction({ action: 'restartRoom', roomId }, '再来一局失败');
}

function surrenderRoom(roomId) {
  return callRoomAction({ action: 'surrenderRoom', roomId }, '投降失败');
}

function leaveRoom(roomId) {
  return callRoomAction({ action: 'leaveRoom', roomId }, '离开失败')
    .then(() => undefined);
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
  surrenderRoom,
  leaveRoom,
  getOpenId,
};
