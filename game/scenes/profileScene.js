const { drawButton } = require('../renderers/buttonRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawAvatar } = require('../renderers/avatarRenderer');
const { COLORS } = require('../design/theme');
const {
  getStoredPlayer,
  normalizeWechatUserInfo,
  updatePlayer,
} = require('../../utils/playerSession');
const { showToast } = require('../../utils/clipboard');

class ProfileScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.player = getStoredPlayer(runtime.wx);
    this.keyboardHandler = null;
    this.userInfoButton = null;
    this.savingAvatar = false;
  }

  onEnter() {
    this.player = getStoredPlayer(this.runtime.wx);
    this.createWeChatProfileButton();
    this.refreshAuthorizedProfile();
  }

  onExit() {
    this.clearKeyboardHandler();
    this.destroyWeChatProfileButton();
    if (this.runtime.wx.hideKeyboard) this.runtime.wx.hideKeyboard();
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    drawTitle(ctx, '玩家资料', width / 2, 52);
    drawSubtitle(ctx, '连接微信身份后，可授权同步或自定义游戏资料', width / 2, 84);

    drawCard(ctx, {
      x: 28,
      y: 108,
      width: width - 56,
      height: 150,
    });
    drawAvatar(ctx, this.runtime.wx, this.player, width / 2 - 38, 124, 76, () => manager.render());
    drawLabel(ctx, this.player ? this.player.nickname : '棋友', width / 2, 218, 'center', {
      bold: true,
      size: 18,
    });
    drawLabel(ctx, this.player ? '微信身份已连接' : '尚未连接微信身份', width / 2, 240, 'center', {
      size: 11,
      color: this.player ? COLORS.jade : COLORS.danger,
    });

    drawPill(ctx, {
      x: width / 2 - 62,
      y: 276,
      width: 124,
      text: this.getAvatarSourceText(),
      fill: COLORS.jadeSoft,
      color: COLORS.jade,
    });

    drawButton(ctx, input, {
      x: 36,
      y: 342,
      width: width - 72,
      height: 50,
      text: this.savingAvatar ? '正在保存头像…' : '从相册选择头像',
      variant: 'secondary',
      disabled: this.savingAvatar,
      onTap: () => this.chooseCustomAvatar(),
    });

    if (!this.userInfoButton) {
      drawButton(ctx, input, {
        x: 36,
        y: 406,
        width: width - 72,
        height: 50,
        text: '同步微信头像和昵称',
        variant: 'gold',
        onTap: () => this.showProfileHelp(),
      });
    }

    drawButton(ctx, input, {
      x: 36,
      y: 470,
      width: width - 72,
      height: 50,
      text: '修改游戏昵称',
      variant: 'ghost',
      onTap: () => this.editNickname(),
    });
    drawButton(ctx, input, {
      x: 36,
      y: 534,
      width: width - 72,
      height: 44,
      text: '恢复系统默认头像',
      variant: 'ghost',
      onTap: () => this.useDefaultAvatar(),
    });
    drawButton(ctx, input, {
      x: 36,
      y: 592,
      width: width - 72,
      height: 50,
      text: '保存并返回首页',
      onTap: () => manager.go('home'),
    });
    drawSubtitle(ctx, '头像和昵称只用于游戏内展示，不会静默读取', width / 2, 660);
  }

  getAvatarSourceText() {
    if (!this.player) return '系统默认头像';
    if (this.player.avatarMode === 'wechat') return '当前：微信头像';
    if (this.player.avatarMode === 'custom') return '当前：相册头像';
    return '当前：系统默认头像';
  }

  createWeChatProfileButton() {
    const wxApi = this.runtime.wx;
    if (!wxApi || typeof wxApi.createUserInfoButton !== 'function') return;
    const { width } = this.runtime;
    this.userInfoButton = wxApi.createUserInfoButton({
      type: 'text',
      text: '同步微信头像和昵称',
      withCredentials: false,
      lang: 'zh_CN',
      style: {
        left: 36,
        top: 406,
        width: width - 72,
        height: 50,
        lineHeight: 50,
        backgroundColor: COLORS.goldSoft,
        color: '#79551D',
        textAlign: 'center',
        fontSize: 16,
        borderRadius: 16,
      },
    });
    this.userInfoButton.onTap(result => {
      if (!result || !result.userInfo || !this.player) {
        this.showProfileHelp(result && result.errMsg);
        return;
      }
      this.applyWeChatProfile(result.userInfo);
    });
  }

  refreshAuthorizedProfile() {
    const wxApi = this.runtime.wx;
    if (!this.player
      || !wxApi
      || typeof wxApi.getSetting !== 'function'
      || typeof wxApi.getUserInfo !== 'function') return;
    wxApi.getSetting({
      success: result => {
        const authorized = result
          && result.authSetting
          && result.authSetting['scope.userInfo'];
        if (!authorized) return;
        wxApi.getUserInfo({
          lang: 'zh_CN',
          success: infoResult => {
            if (infoResult && infoResult.userInfo) {
              this.applyWeChatProfile(infoResult.userInfo, false);
            }
          },
        });
      },
    });
  }

  applyWeChatProfile(userInfo, showFeedback = true) {
    const profile = normalizeWechatUserInfo(userInfo);
    if (!profile.usable || !this.player) {
      if (showFeedback) this.showProfileHelp();
      return false;
    }
    this.player = updatePlayer(this.runtime.wx, this.player, {
      nickname: profile.nickname || this.player.nickname,
      wechatNickname: profile.nickname,
      wechatAvatarUrl: profile.avatarUrl,
      avatarMode: profile.avatarUrl ? 'wechat' : this.player.avatarMode,
      profileCompleted: true,
    });
    this.runtime.manager.render();
    if (showFeedback) showToast(this.runtime.wx, '微信资料已同步', 'success');
    return true;
  }

  showProfileHelp(detail = '') {
    const wxApi = this.runtime.wx;
    if (wxApi && typeof wxApi.showModal === 'function') {
      wxApi.showModal({
        title: '未取得微信资料',
        content: detail && detail.includes('deny')
          ? '你已取消授权。仍可使用相册头像和自定义游戏昵称。'
          : '请在微信授权窗口中确认；若当前微信版本未返回资料，可使用相册头像和自定义游戏昵称。',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }
    showToast(wxApi, '可使用相册头像和自定义昵称');
  }

  destroyWeChatProfileButton() {
    if (this.userInfoButton && this.userInfoButton.destroy) this.userInfoButton.destroy();
    this.userInfoButton = null;
  }

  chooseCustomAvatar() {
    const wxApi = this.runtime.wx;
    if (!this.player || !wxApi
      || (typeof wxApi.chooseMedia !== 'function' && typeof wxApi.chooseImage !== 'function')) {
      showToast(wxApi, '当前微信版本暂不支持相册头像');
      return;
    }
    const options = {
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: result => {
        const mediaFile = result && result.tempFiles && result.tempFiles[0];
        const tempPath = (mediaFile && (mediaFile.tempFilePath || mediaFile.path))
          || (result && result.tempFilePaths && result.tempFilePaths[0]);
        if (!tempPath) return;
        this.persistCustomAvatar(tempPath);
      },
      fail: () => showToast(wxApi, '已取消选择头像'),
    };
    if (typeof wxApi.chooseMedia === 'function') {
      wxApi.chooseMedia(options);
    } else {
      wxApi.chooseImage({
        ...options,
        sizeType: ['compressed'],
      });
    }
  }

  persistCustomAvatar(tempPath) {
    const wxApi = this.runtime.wx;
    const fileSystem = wxApi.getFileSystemManager && wxApi.getFileSystemManager();
    if (!fileSystem || typeof fileSystem.saveFile !== 'function') {
      this.saveCustomAvatarPath(tempPath);
      return;
    }
    this.savingAvatar = true;
    this.runtime.manager.render();
    fileSystem.saveFile({
      tempFilePath: tempPath,
      success: result => this.saveCustomAvatarPath(result.savedFilePath),
      fail: () => {
        this.savingAvatar = false;
        this.runtime.manager.render();
        showToast(wxApi, '头像保存失败，请重试');
      },
    });
  }

  saveCustomAvatarPath(path) {
    this.player = updatePlayer(this.runtime.wx, this.player, {
      customAvatarPath: path,
      avatarMode: 'custom',
      profileCompleted: true,
    });
    this.savingAvatar = false;
    this.runtime.manager.render();
    showToast(this.runtime.wx, '头像已更新', 'success');
  }

  useDefaultAvatar() {
    if (!this.player) return;
    this.player = updatePlayer(this.runtime.wx, this.player, {
      avatarMode: 'jade',
    });
    this.runtime.manager.render();
    showToast(this.runtime.wx, '已使用系统默认头像', 'success');
  }

  editNickname() {
    const wxApi = this.runtime.wx;
    if (!this.player || !wxApi || typeof wxApi.showKeyboard !== 'function') {
      showToast(wxApi, '当前微信版本暂不支持修改');
      return;
    }
    this.clearKeyboardHandler();
    this.keyboardHandler = result => {
      this.player = updatePlayer(wxApi, this.player, {
        nickname: result && result.value,
        profileCompleted: true,
      });
      this.clearKeyboardHandler();
      if (wxApi.hideKeyboard) wxApi.hideKeyboard();
      this.runtime.manager.render();
      showToast(wxApi, '昵称已更新', 'success');
    };
    if (wxApi.onKeyboardConfirm) wxApi.onKeyboardConfirm(this.keyboardHandler);
    wxApi.showKeyboard({
      defaultValue: this.player.nickname,
      maxLength: 12,
      multiple: false,
      confirmHold: false,
      confirmType: 'done',
    });
  }

  clearKeyboardHandler() {
    if (!this.keyboardHandler) return;
    if (this.runtime.wx.offKeyboardConfirm) {
      this.runtime.wx.offKeyboardConfirm(this.keyboardHandler);
    }
    this.keyboardHandler = null;
  }
}

module.exports = ProfileScene;
