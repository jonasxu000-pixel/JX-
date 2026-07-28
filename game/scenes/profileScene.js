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
const { getContentTop } = require('../../utils/safeArea');

class ProfileScene {
  constructor(runtime) {
    this.runtime = runtime;
    this.player = getStoredPlayer(runtime.wx);
    this.keyboardHandler = null;
    this.userInfoButton = null;
    this.savingAvatar = false;
    this.privacyPreparing = false;
    this.privacyReady = false;
    this.privacyError = '';
  }

  onEnter() {
    this.player = getStoredPlayer(this.runtime.wx);
    this.preparePrivacyAuthorization();
    this.refreshAuthorizedProfile();
  }

  onExit() {
    this.clearKeyboardHandler();
    this.destroyWeChatProfileButton();
    if (this.runtime.wx.hideKeyboard) this.runtime.wx.hideKeyboard();
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    const layout = this.getLayout();
    drawTitle(ctx, '玩家资料', width / 2, layout.titleY);
    drawSubtitle(ctx, '设置你在好友对局中展示的头像和昵称', width / 2, layout.subtitleY);

    drawCard(ctx, {
      x: 28,
      y: layout.cardY,
      width: width - 56,
      height: 146,
    });
    drawAvatar(ctx, this.runtime.wx, this.player, 48, layout.cardY + 31, 76, () => manager.render());
    drawLabel(ctx, formatProfileNickname(this.player && this.player.nickname), 144, layout.cardY + 43, 'left', {
      bold: true,
      size: 18,
    });
    drawPill(ctx, {
      x: 144,
      y: layout.cardY + 58,
      width: 92,
      height: 26,
      text: this.player ? '微信已连接' : '尚未连接',
      fill: this.player ? COLORS.jadeSoft : '#F5E4DF',
      color: this.player ? COLORS.jade : COLORS.danger,
    });
    drawLabel(ctx, '好友对局中将展示此头像和昵称', 144, layout.cardY + 112, 'left', {
      size: 11,
      color: COLORS.inkMuted,
    });

    drawLabel(ctx, '资料设置', 36, layout.sectionTitleY, 'left', {
      bold: true,
      size: 14,
      color: COLORS.ink,
    });

    if (!this.userInfoButton) {
      drawButton(ctx, input, {
        x: 36,
        y: layout.syncY,
        width: width - 72,
        height: 50,
        text: this.privacyPreparing ? '正在准备微信授权…' : '同步微信头像昵称',
        variant: 'gold',
        disabled: this.privacyPreparing,
        onTap: () => this.preparePrivacyAuthorization(true),
      });
    }

    const quickWidth = (width - 84) / 2;
    drawButton(ctx, input, {
      x: 36,
      y: layout.quickActionY,
      width: quickWidth,
      height: 50,
      text: this.savingAvatar ? '正在保存…' : '从相册选择',
      variant: 'secondary',
      disabled: this.savingAvatar,
      onTap: () => this.chooseCustomAvatar(),
    });
    drawButton(ctx, input, {
      x: 48 + quickWidth,
      y: layout.quickActionY,
      width: quickWidth,
      height: 50,
      text: '修改昵称',
      variant: 'secondary',
      onTap: () => this.editNickname(),
    });
    drawButton(ctx, input, {
      x: 36,
      y: layout.defaultAvatarY,
      width: width - 72,
      height: 44,
      text: '使用系统默认头像',
      variant: 'ghost',
      onTap: () => this.useDefaultAvatar(),
    });
    drawButton(ctx, input, {
      x: 36,
      y: layout.saveY,
      width: width - 72,
      height: 50,
      text: '保存并返回首页',
      onTap: () => manager.go('home'),
    });
    drawSubtitle(ctx, '头像昵称可随时修改，仅用于游戏内展示', width / 2, layout.footerY);
  }

  getLayout() {
    const safeTop = getContentTop(this.runtime.wx);
    return {
      titleY: safeTop + 22,
      subtitleY: safeTop + 48,
      cardY: safeTop + 70,
      sectionTitleY: safeTop + 242,
      syncY: safeTop + 262,
      quickActionY: safeTop + 326,
      defaultAvatarY: safeTop + 390,
      saveY: safeTop + 448,
      footerY: safeTop + 516,
    };
  }

  createWeChatProfileButton() {
    const wxApi = this.runtime.wx;
    if (!this.privacyReady
      || this.userInfoButton
      || !wxApi
      || typeof wxApi.createUserInfoButton !== 'function') return;
    const { width } = this.runtime;
    const layout = this.getLayout();
    this.userInfoButton = wxApi.createUserInfoButton({
      type: 'text',
      text: '同步微信头像和昵称',
      withCredentials: false,
      lang: 'zh_CN',
      style: {
        left: 36,
        top: layout.syncY,
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

  preparePrivacyAuthorization(force = false) {
    if (this.privacyPreparing || (this.privacyReady && !force)) return;

    const wxApi = this.runtime.wx;
    this.destroyWeChatProfileButton();
    this.privacyError = '';

    if (!wxApi || typeof wxApi.requirePrivacyAuthorize !== 'function') {
      this.privacyReady = true;
      this.createWeChatProfileButton();
      this.runtime.manager.render();
      return;
    }

    this.privacyPreparing = true;
    this.privacyReady = false;
    this.runtime.manager.render();
    wxApi.requirePrivacyAuthorize({
      success: () => {
        this.privacyPreparing = false;
        this.privacyReady = true;
        this.createWeChatProfileButton();
        this.runtime.manager.render();
      },
      fail: err => {
        this.privacyPreparing = false;
        this.privacyReady = false;
        this.privacyError = String((err && err.errMsg) || 'privacy authorization failed');
        this.runtime.manager.render();
        this.showPrivacyFailure();
      },
    });
  }

  showPrivacyFailure() {
    const wxApi = this.runtime.wx;
    if (wxApi && typeof wxApi.showModal === 'function') {
      wxApi.showModal({
        title: '需要隐私授权',
        content: '同步微信头像昵称前，需要先同意《用户隐私保护指引》。你也可以继续使用相册头像和自定义昵称。',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }
    showToast(wxApi, '请先同意用户隐私保护指引');
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
    const errorDetail = String(detail || '');
    if (errorDetail && typeof console !== 'undefined' && console.warn) {
      console.warn('[profile] 微信资料授权未完成:', errorDetail);
    }
    if (wxApi && typeof wxApi.showModal === 'function') {
      const isDenied = errorDetail.includes('deny') || errorDetail.includes('cancel');
      const diagnostic = errorDetail
        ? `\n\n微信返回：${errorDetail.slice(0, 80)}`
        : '';
      wxApi.showModal({
        title: '微信未返回头像昵称',
        content: isDenied
          ? '你已取消授权。仍可使用相册头像和自定义游戏昵称。'
          : `请确认小游戏后台已声明“昵称、头像”并开启“隐私授权弹窗”。完成前可使用相册头像和自定义昵称。${diagnostic}`,
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

function formatProfileNickname(nickname) {
  const name = String(nickname || '棋友').trim();
  return name.length > 9 ? `${name.slice(0, 9)}…` : name;
}

module.exports = ProfileScene;
