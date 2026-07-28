const STORAGE_KEY = 'gomoku_player_session_v1';

function getStoredPlayer(wxApi) {
  if (!wxApi || typeof wxApi.getStorageSync !== 'function') return null;
  try {
    const stored = wxApi.getStorageSync(STORAGE_KEY);
    if (!stored || !stored.openId) return null;
    return {
      ...stored,
      nickname: sanitizeNickname(stored.nickname),
      avatarMode: stored.avatarMode || 'jade',
    };
  } catch (err) {
    return null;
  }
}

function sanitizeNickname(value) {
  const nickname = String(value || '').trim().slice(0, 12);
  return nickname || '微信棋友';
}

function savePlayer(wxApi, openId, userInfo = {}) {
  const nickname = sanitizeNickname(userInfo.nickName);
  const avatarUrl = String(userInfo.avatarUrl || '');
  const player = {
    openId: String(openId || ''),
    loginAt: Date.now(),
    nickname,
    avatarMode: avatarUrl ? 'wechat' : 'jade',
    wechatNickname: nickname,
    wechatAvatarUrl: avatarUrl,
  };
  if (!player.openId) throw new Error('微信身份获取失败');

  if (wxApi && typeof wxApi.setStorageSync === 'function') {
    wxApi.setStorageSync(STORAGE_KEY, player);
  }
  return player;
}

function updatePlayer(wxApi, currentPlayer, changes) {
  if (!currentPlayer || !currentPlayer.openId) {
    throw new Error('请先完成微信登录');
  }
  const player = {
    ...currentPlayer,
    ...changes,
  };
  player.nickname = sanitizeNickname(player.nickname);
  if (wxApi && typeof wxApi.setStorageSync === 'function') {
    wxApi.setStorageSync(STORAGE_KEY, player);
  }
  return player;
}

module.exports = {
  STORAGE_KEY,
  getStoredPlayer,
  savePlayer,
  updatePlayer,
};
