const { extractRoomId } = require('./clipboard');

function buildRoomSharePayload(roomId) {
  const normalized = extractRoomId(roomId);
  if (!normalized || normalized !== String(roomId)) {
    throw new Error('房间号无效，暂时无法邀请好友');
  }

  return {
    title: `来「棋遇五子棋」和我下一局｜房间 ${normalized}`,
    query: `roomId=${normalized}`,
  };
}

function shareRoom(wxApi, roomId) {
  if (!wxApi || typeof wxApi.shareAppMessage !== 'function') {
    throw new Error('当前微信版本暂不支持直接邀请');
  }
  const payload = buildRoomSharePayload(roomId);
  wxApi.shareAppMessage(payload);
  return payload;
}

function getSharedRoomId(options) {
  const query = options && options.query;
  const roomId = query && query.roomId;
  const normalized = extractRoomId(roomId);
  return normalized === String(roomId || '') ? normalized : '';
}

module.exports = {
  buildRoomSharePayload,
  getSharedRoomId,
  shareRoom,
};
