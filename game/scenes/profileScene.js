const { drawButton } = require('../renderers/buttonRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { drawTitle, drawSubtitle, drawLabel } = require('../renderers/textRenderer');
const { drawAvatar } = require('../renderers/avatarRenderer');
const { COLORS } = require('../design/theme');
const { getStoredPlayer, updatePlayer } = require('../../utils/playerSession');
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
    this.createWeChatProfileButton();
  }

  onExit() {
    this.clearKeyboardHandler();
    this.destroyWeChatProfileButton();
    if (this.runtime.wx.hideKeyboard) this.runtime.wx.hideKeyboard();
  }

  render(ctx, input) {
    const { width, manager } = this.runtime;
    drawTitle(ctx, '玩家资料', width / 2, 52);
    drawSubtitle(ctx, '微信资料、相册头像和自定义昵称均可自由选择', width / 2, 84);

    drawCard(ctx, {
      x: 28,
      y: 108,
      width: width - 56,
      height: 138,
    });
    drawAvatar(ctx, this.runtime.wx, this.player, width / 2 - 38, 124, 76, () => manager.render());
    drawLabel(ctx, this.player ? this.player.nickname : '微信棋友', width / 2, 222, 'center', {
      bold: true,
      size: 18,
    });

    drawPill(ctx, {
      x: width / 2 - 62,
      y: 266,
      width: 124,
      text: this.getAvatarSourceText(),
      fill: COLORS.jadeSoft,
      color: COLORS.jade,
    });

    drawButton(ctx, input, {
      x: 36,
      y: 310,
      width: width - 72,
      height: 50,
      text: this.savingAvatar ? '正在保存头像…' : '从手机相册选择头像',
      variant: 'secondary',
      disabled: this.savingAvatar,
      onTap: () => this.chooseCustomAvatar(),
    });

    if (!this.userInfoButton) {
      drawButton(ctx, input, {
        x: 36,
        y: 374,
        width: width - 72,
        height: 50,
        text: '使用微信头像和昵称',
        variant: 'gold',
        onTap: () => showToast(this.runtime.wx, '当前微信版本暂不支持读取资料'),
      });
    }

    drawButton(ctx, input, {
      x: 36,
      y: 438,
      width: width - 72,
      height: 50,
      text: '使用系统默认头像',
      variant: 'ghost',
      onTap: () => this.useDefaultAvatar(),
    });
    drawButton(ctx, input, {
      x: 36,
      y: 502,
      width: width - 72,
      height: 50,
      text: '修改游戏昵称',
      variant: 'ghost',
      onTap: () => this.editNickname(),
    });
    drawButton(ctx, input, {
      x: 36,
      y: 566,
      width: width - 72,
      height: 50,
      text: '保存并返回首页',
      onTap: () => manager.go('home'),
    });
    drawSubtitle(ctx, '头像和昵称只用于游戏内展示', width / 2, 642);
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
      text: '使用微信头像和昵称',
      withCredentials: false,
      lang: 'zh_CN',
      style: {
        left: 36,
        top: 374,
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
        showToast(wxApi, '已取消使用微信资料');
        return;
      }
      const userInfo = result.userInfo;
      this.player = updatePlayer(wxApi, this.player, {
        nickname: userInfo.nickName,
        wechatNickname: userInfo.nickName,
        wechatAvatarUrl: userInfo.avatarUrl || '',
        avatarMode: userInfo.avatarUrl ? 'wechat' : 'jade',
      });
      this.runtime.manager.render();
      showToast(wxApi, '微信资料已更新', 'success');
    });
  }

  destroyWeChatProfileButton() {
    if (this.userInfoButton && this.userInfoButton.destroy) this.userInfoButton.destroy();
    this.userInfoButton = null;
  }

  chooseCustomAvatar() {
    const wxApi = this.runtime.wx;
    if (!this.player || !wxApi || typeof wxApi.chooseImage !== 'function') {
      showToast(wxApi, '当前微信版本暂不支持相册头像');
      return;
    }
    wxApi.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: result => {
        const tempPath = result && result.tempFilePaths && result.tempFilePaths[0];
        if (!tempPath) return;
        this.persistCustomAvatar(tempPath);
      },
      fail: () => showToast(wxApi, '已取消选择头像'),
    });
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
