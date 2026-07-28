const STORAGE_KEY = 'gomoku_player_session_v1';
const DEFAULT_NICKNAME = '棋友';
const PLACEHOLDER_NAMES = new Set(['微信用户', '微信棋友', DEFAULT_NICKNAME]);

function getStoredPlayer(wxApi) {
  if (!wxApi || typeof wxApi.getStorageSync !== 'function') return null;
  try {
    const stored = wxApi.getStorageSync(STORAGE_KEY);
    if (!stored || !stored.openId) return null;
    const wechatProfile = normalizeWechatUserInfo({
      nickName: stored.wechatNickname,
      avatarUrl: stored.wechatAvatarUrl,
    });
    const profileCompleted = Boolean(
      stored.profileCompleted
      || wechatProfile.usable
      || stored.avatarMode === 'custom'
      || (stored.nickname && !PLACEHOLDER_NAMES.has(String(stored.nickname).trim())),
    );
    return {
      ...stored,
      nickname: sanitizeNickname(stored.nickname),
      avatarMode: stored.avatarMode || 'jade',
      wechatNickname: wechatProfile.nickname,
      wechatAvatarUrl: wechatProfile.avatarUrl,
      profileCompleted,
    };
  } catch (err) {
    return null;
  }
}

function sanitizeNickname(value) {
  const nickname = String(value || '').trim().slice(0, 12);
  return nickname || DEFAULT_NICKNAME;
}

function normalizeWechatUserInfo(userInfo = {}) {
  const nickname = String(userInfo.nickName || '').trim().slice(0, 12);
  const avatarUrl = String(userInfo.avatarUrl || '').trim();
  const hasRealNickname = Boolean(nickname && !PLACEHOLDER_NAMES.has(nickname));
  return {
    nickname: hasRealNickname ? nickname : '',
    avatarUrl,
    usable: Boolean(hasRealNickname || avatarUrl),
  };
}

function getPublicPlayerProfile(player) {
  const source = player || {};
  const wechatAvatarUrl = String(source.wechatAvatarUrl || '').trim();
  const avatarUrl = source.avatarMode === 'wechat' && /^https:\/\//i.test(wechatAvatarUrl)
    ? wechatAvatarUrl.slice(0, 1024)
    : '';
  return {
    nickname: sanitizeNickname(source.nickname),
    avatarUrl,
  };
}

function savePlayer(wxApi, openId, userInfo = {}, currentPlayer = null) {
  const wechatProfile = normalizeWechatUserInfo(userInfo);
  const hasCustomProfile = Boolean(currentPlayer && currentPlayer.profileCompleted);
  const player = {
    ...(currentPlayer || {}),
    openId: String(openId || ''),
    loginAt: Date.now(),
    nickname: wechatProfile.nickname
      || (hasCustomProfile ? sanitizeNickname(currentPlayer.nickname) : DEFAULT_NICKNAME),
    avatarMode: wechatProfile.avatarUrl
      ? 'wechat'
      : ((hasCustomProfile && currentPlayer.avatarMode) || 'jade'),
    wechatNickname: wechatProfile.nickname,
    wechatAvatarUrl: wechatProfile.avatarUrl,
    profileCompleted: Boolean(wechatProfile.usable || hasCustomProfile),
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
  player.profileCompleted = Boolean(
    player.profileCompleted
    || player.avatarMode === 'custom'
    || !PLACEHOLDER_NAMES.has(player.nickname),
  );
  if (wxApi && typeof wxApi.setStorageSync === 'function') {
    wxApi.setStorageSync(STORAGE_KEY, player);
  }
  return player;
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_NICKNAME,
  getPublicPlayerProfile,
  getStoredPlayer,
  normalizeWechatUserInfo,
  savePlayer,
  updatePlayer,
};
