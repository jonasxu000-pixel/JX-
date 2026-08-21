/**
 * Room service: client wrapper for cloud room operations.
 */

function assertCloudResult(res, fallbackMessage) {
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || fallbackMessage);
  }
  return res.result;
}

function normalizeCloudError(err, fallbackMessage) {
  const rawMessage = err && err.message ? err.message : String(err || '');

  // 开发者工具未以正式 AppID 打开工程时，云调用会返回一段内部错误串。
  // 不把该串直接展示给玩家，改为能帮助开发者定位的明确提示。
  if (/appid missing/i.test(rawMessage)) {
    return '当前开发环境未绑定正式 AppID，请重新打开项目后再试';
  }

  if (/env|environment/i.test(rawMessage)) {
    return '云环境未连接，请检查开发者工具的云开发环境';
  }

  return rawMessage || fallbackMessage;
}

function callRoomAction(data, fallbackMessage) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    return Promise.reject(new Error('当前环境暂不支持云端好友房'));
  }

  return wx.cloud.callFunction({ name: 'roomAction', data })
    .then(res => assertCloudResult(res, fallbackMessage))
    .catch(err => Promise.reject(new Error(normalizeCloudError(err, fallbackMessage))));
}

function createRoom(playerProfile) {
  return callRoomAction({ action: 'createRoom', playerProfile }, '创建失败')
    .then(result => result.roomId);
}

function joinRoom(roomId, playerProfile) {
  return callRoomAction({ action: 'joinRoom', roomId, playerProfile }, '加入失败')
    .then(result => {
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
