const { createRuntime, CLOUD_ENV } = require('../game/runtime');
const board = require('../utils/board');
const CreateRoomScene = require('../game/scenes/createRoomScene');
const HomeScene = require('../game/scenes/homeScene');
const JoinRoomScene = require('../game/scenes/joinRoomScene');
const LocalGameScene = require('../game/scenes/localGameScene');
const OnlineGameScene = require('../game/scenes/onlineGameScene');
const ProfileScene = require('../game/scenes/profileScene');
const WaitRoomScene = require('../game/scenes/waitRoomScene');
const InputManager = require('../game/core/inputManager');
const {
  drawResultOverlay,
  getResultOverlayLayout,
} = require('../game/renderers/resultOverlayRenderer');
const { buildRoomSharePayload } = require('../utils/share');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function createContextMock() {
  const noop = () => {};
  const texts = [];
  return {
    texts,
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    clip: noop,
    drawImage: noop,
    fillText(value) {
      texts.push(String(value));
    },
    measureText(value) {
      const match = String(this.font || '').match(/(\d+)px/);
      const size = match ? Number(match[1]) : 14;
      return { width: String(value).length * size };
    },
    createRadialGradient() {
      return { addColorStop: noop };
    },
  };
}

function createWxMock() {
  const ctx = createContextMock();
  const storage = {};
  return {
    touchHandler: null,
    touchMoveHandler: null,
    touchEndHandler: null,
    touchCancelHandler: null,
    showHandler: null,
    hideHandler: null,
    createCanvas() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return ctx;
        },
      };
    },
    getSystemInfoSync() {
      return {
        screenWidth: 375,
        screenHeight: 667,
        pixelRatio: 1,
        statusBarHeight: 20,
      };
    },
    getMenuButtonBoundingClientRect() {
      return this.menuButtonRect || {
        top: 24,
        bottom: 56,
        left: 280,
        right: 350,
        width: 70,
        height: 32,
      };
    },
    requirePrivacyAuthorize(options) {
      this.privacyAuthorizeCalls = (this.privacyAuthorizeCalls || 0) + 1;
      if (this.privacyAuthorizeError) {
        options.fail({ errMsg: this.privacyAuthorizeError });
        return;
      }
      options.success({});
    },
    onTouchStart(handler) {
      this.touchHandler = handler;
    },
    onTouchMove(handler) {
      this.touchMoveHandler = handler;
    },
    onTouchEnd(handler) {
      this.touchEndHandler = handler;
    },
    onTouchCancel(handler) {
      this.touchCancelHandler = handler;
    },
    onShow(handler) {
      this.showHandler = handler;
    },
    onHide(handler) {
      this.hideHandler = handler;
    },
    getLaunchOptionsSync() {
      return this.launchOptions || {};
    },
    setClipboardData() {},
    getStorageSync(key) {
      return storage[key];
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    showToast() {},
    showModal(options) {
      this.lastModal = options;
    },
    chooseMedia(options) {
      options.success({ tempFiles: [{ tempFilePath: 'wxfile://tmp/avatar.jpg' }] });
    },
    chooseImage(options) {
      options.success({ tempFilePaths: ['wxfile://tmp/avatar.jpg'] });
    },
    getFileSystemManager() {
      return {
        saveFile(options) {
          options.success({ savedFilePath: 'wxfile://saved/avatar.jpg' });
        },
      };
    },
    showKeyboard(options) {
      this.keyboardOptions = options;
    },
    hideKeyboard() {},
    onKeyboardConfirm(handler) {
      this.keyboardHandler = handler;
    },
    offKeyboardConfirm(handler) {
      if (this.keyboardHandler === handler) this.keyboardHandler = null;
    },
    createUserInfoButton(options) {
      const button = {
        options,
        destroyed: false,
        onTap(handler) {
          this.tapHandler = handler;
        },
        destroy() {
          this.destroyed = true;
        },
        trigger(result) {
          this.tapHandler(result);
        },
      };
      this.lastUserInfoButton = button;
      return button;
    },
    shareAppMessage(options) {
      this.lastSharePayload = options;
    },
    cloud: {
      callFunctionCalls: [],
      init(options) {
        this.initOptions = options;
      },
      callFunction(options) {
        this.callFunctionCalls.push(options);
        if (options.name === 'login') {
          return Promise.resolve({ result: { openid: 'test-wechat-openid' } });
        }
        return Promise.resolve({ result: { success: true } });
      },
    },
  };
}

async function verifyWeChatLogin() {
  const { wx, runtime } = createStartedRuntime();
  const scene = runtime.manager.current;
  assert(!scene.player, 'home scene should begin logged out without a stored session');

  assert(wx.lastUserInfoButton, 'home scene must create the official WeChat user info button');
  wx.lastUserInfoButton.trigger({
    userInfo: {
      nickName: '棋友小徐',
      avatarUrl: 'https://example.com/avatar.png',
    },
  });
  await flush();
  await flush();

  assert(scene.player && scene.player.openId === 'test-wechat-openid', 'WeChat login must save the cloud OpenID');
  assert(scene.player.nickname === '棋友小徐', 'WeChat login must use the authorized nickname by default');
  assert(scene.player.wechatAvatarUrl.includes('avatar.png'), 'WeChat login must save the authorized avatar');
  assert(runtime.manager.runtime.cloud.getPlayerProfile().avatarUrl.includes('avatar.png'),
    'room profile must expose an authorized WeChat avatar');
  assert(wx.lastUserInfoButton.destroyed, 'native login button must be destroyed after login');
  assert(wx.cloud.callFunctionCalls.some(call => call.name === 'login'), 'WeChat login must call the login cloud function');

  runtime.manager.go('home');
  assert(runtime.manager.current.player.openId === 'test-wechat-openid', 'stored WeChat login must survive scene recreation');

  runtime.manager.go('profile');
  const profileScene = runtime.manager.current;
  assert(wx.privacyAuthorizeCalls === 1, 'profile scene must prepare official privacy authorization');
  assert(wx.lastUserInfoButton.options.style.top === profileScene.getLayout().syncY,
    'native profile button must align with the Canvas authorization button');
  profileScene.editNickname();
  const confirmNickname = wx.keyboardHandler;
  confirmNickname({ value: '自定义棋手' });
  assert(profileScene.player.nickname === '自定义棋手', 'player must be able to choose a custom nickname');
  profileScene.chooseCustomAvatar();
  assert(profileScene.player.avatarMode === 'custom', 'player must be able to choose an album avatar');
  assert(profileScene.player.customAvatarPath.includes('saved/avatar.jpg'), 'album avatar must be persisted locally');
  assert(runtime.manager.runtime.cloud.getPlayerProfile().avatarUrl === '',
    'device-local album avatars must not be sent as unusable room URLs');

  runtime.manager.go('home');
  assert(runtime.manager.current.player.nickname === '自定义棋手', 'custom profile must persist on the home scene');
}

async function verifyIncompleteProfileIsNotMarkedComplete() {
  const { wx, runtime } = createStartedRuntime();
  const homeScene = runtime.manager.current;
  wx.lastUserInfoButton.trigger({ errMsg: 'getUserInfo:fail auth deny' });
  await flush();
  await flush();

  const stored = wx.getStorageSync('gomoku_player_session_v1');
  assert(stored && stored.openId === 'test-wechat-openid', 'identity login must still persist OpenID after profile denial');
  assert(!stored.profileCompleted, 'denied profile access must not be marked as a completed profile');
  assert(!stored.wechatNickname, 'default nickname must not be misreported as a WeChat nickname');
  assert(runtime.manager.current.constructor.name === 'ProfileScene', 'incomplete profile must open the player setup scene');
  assert(homeScene.userInfoButton === null, 'home native login button must be cleaned before changing scenes');
}

function verifyPrivacyAuthorizationFailure() {
  const wx = createWxMock();
  wx.privacyAuthorizeError = 'requirePrivacyAuthorize:fail privacy deny';
  wx.setStorageSync('gomoku_player_session_v1', {
    openId: 'test-wechat-openid',
    nickname: '微信棋友',
    avatarMode: 'jade',
  });
  const runtime = createRuntime(wx);
  runtime.start();
  runtime.manager.go('profile');

  const scene = runtime.manager.current;
  assert(scene instanceof ProfileScene, 'privacy failure check must enter ProfileScene');
  assert(!scene.userInfoButton, 'native user-info button must wait for privacy authorization');
  assert(wx.lastModal && wx.lastModal.title === '需要隐私授权',
    'privacy refusal must show a clear recovery message');
}

function verifyOnlinePlayerProfiles() {
  const wx = createWxMock();
  wx.setStorageSync('gomoku_player_session_v1', {
    openId: 'guest-openid',
    nickname: '本机白棋昵称也很长',
    avatarMode: 'wechat',
    wechatAvatarUrl: 'https://example.com/local-guest.png',
    profileCompleted: true,
  });
  const runtime = {
    wx,
    width: 375,
    height: 667,
    cloud: {},
    manager: {
      go() {},
      render() {},
    },
  };
  const scene = new OnlineGameScene(runtime, {
    roomId: '123456',
    role: 'guest',
    color: 'white',
  });
  scene.active = true;
  scene.applyRoom({
    _id: '123456',
    host: {
      openId: 'host-openid',
      color: 'black',
      nickname: '远程黑棋十二字昵称',
      avatarUrl: 'https://example.com/remote-host.png',
    },
    guest: {
      openId: 'guest-openid',
      color: 'white',
      nickname: '云端白棋',
      avatarUrl: 'https://example.com/remote-guest.png',
    },
    status: 'playing',
    currentTurn: 'host',
    winner: null,
    board: board.createBoard(),
  });

  const ctx = createContextMock();
  const input = new InputManager();
  scene.render(ctx, input);
  assert(scene.hostPlayer.nickname === '远程黑棋十二字昵称', 'opponent nickname must come from the room profile');
  assert(scene.guestPlayer.nickname === '本机白棋昵称也很长', 'own player card must use the latest local profile');
  assert(ctx.texts.includes('远程黑棋十二字昵称'),
    'versus header must render the complete opponent nickname without fixed truncation');
  assert(ctx.texts.includes('本机白棋昵称也很长'),
    'versus header must render the complete local nickname without fixed truncation');
  assert(ctx.texts.includes('⚑ 投降'), 'surrender action must include a visible text label');
}

async function verifySurrenderConfirmation() {
  let surrenderCalls = 0;
  let modalOptions;
  const runtime = {
    wx: {
      showModal(options) {
        modalOptions = options;
      },
    },
    cloud: {
      surrenderRoom() {
        surrenderCalls += 1;
        return Promise.resolve({ success: true });
      },
    },
    manager: {
      render() {},
      go() {},
    },
  };
  const scene = new OnlineGameScene(runtime, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });
  scene.active = false;

  scene.confirmSurrender();
  assert(modalOptions && modalOptions.title.includes('投降'), 'surrender must show an explicit confirmation modal');
  modalOptions.success({ confirm: false, cancel: true });
  await flush();
  assert(surrenderCalls === 0, 'canceling surrender must keep the match running');

  scene.confirmSurrender();
  modalOptions.success({ confirm: true, cancel: false });
  await flush();
  assert(surrenderCalls === 1, 'confirming surrender must call the cloud action once');
  assert(scene.boardLocked, 'surrender submission must lock the board');
}

function verifyRematchAndDepartureViewState() {
  const scene = new OnlineGameScene({
    manager: {
      render() {},
      go() {},
    },
  }, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });
  scene.active = true;

  scene.applyRoom({
    status: 'finished',
    currentTurn: 'host',
    winner: 'host',
    restartReady: { host: true, guest: false },
    board: board.createBoard(),
  });
  assert(scene.restartReady, 'local restart confirmation must be reflected in the result scene');
  assert(!scene.opponentRestartReady, 'opponent must remain unready until they confirm');
  assert(scene.boardLocked, 'finished board must stay locked while waiting for rematch consent');

  scene.applyRoom({
    status: 'finished',
    currentTurn: 'host',
    winner: 'host',
    restartReady: { host: false, guest: true },
    board: board.createBoard(),
  });
  assert(scene.opponentRestartReady, 'opponent restart confirmation must be visible');

  scene.applyRoom(null);
  assert(scene.boardLocked, 'removed room must lock the remaining player board immediately');
  assert(scene.statusText.includes('不存在'), 'removed room must clearly tell the remaining player');
}

function createStartedRuntime() {
  const wx = createWxMock();
  const runtime = createRuntime(wx);
  runtime.start();
  return { wx, runtime };
}

function verifyRuntimeBoot() {
  const { wx, runtime } = createStartedRuntime();
  assert(wx.cloud.initOptions.env === CLOUD_ENV, 'runtime must initialize the expected cloud environment');
  assert(typeof wx.touchHandler === 'function', 'runtime must register touch start input');
  assert(typeof wx.touchMoveHandler === 'function', 'runtime must register touch move input');
  assert(typeof wx.touchEndHandler === 'function', 'runtime must register touch end input');
  assert(typeof wx.touchCancelHandler === 'function', 'runtime must register touch cancel input');
  assert(typeof wx.showHandler === 'function', 'runtime must register foreground recovery');
  assert(typeof wx.hideHandler === 'function', 'runtime must register background suspension');
  assert(runtime.manager.current.constructor.name === 'HomeScene', 'runtime must boot into HomeScene');
  assert(
    wx.cloud.callFunctionCalls.some(call => call.name === 'roomAction' && call.data.action === 'ping'),
    'runtime must prewarm roomAction on startup',
  );
}

function verifyForegroundCanvasRecovery() {
  const { wx, runtime } = createStartedRuntime();
  let scheduledFrame = null;
  runtime.canvas.requestAnimationFrame = callback => {
    scheduledFrame = callback;
    return 7;
  };
  runtime.canvas.cancelAnimationFrame = () => {
    scheduledFrame = null;
  };

  let renderCount = 0;
  runtime.manager.render = () => {
    renderCount += 1;
  };

  wx.hideHandler();
  assert(runtime.manager.suspended, 'backgrounding must suspend foreground redraws');
  wx.showHandler({});
  assert(!runtime.manager.suspended, 'returning to the Mini Game must wake the scene manager');
  assert(renderCount >= 1, 'foreground recovery must redraw immediately');
  assert(typeof scheduledFrame === 'function',
    'foreground recovery must schedule a Canvas animation-frame redraw');
  scheduledFrame();
  assert(renderCount >= 2, 'foreground recovery must redraw again after Canvas resumes');
  runtime.manager.clearForegroundRedraw();
}

function verifyButtonReleaseSemantics() {
  const rect = {
    x: 20,
    y: 30,
    width: 120,
    height: 52,
  };
  let taps = 0;

  function createInput() {
    const input = new InputManager();
    input.addHitArea(rect, () => {
      taps += 1;
    });
    return input;
  }

  let input = createInput();
  assert(input.handleTouchStart(40, 50), 'touch start inside a button must be captured');
  assert(taps === 0, 'touch start must not activate a button');
  assert(input.isPressed(rect), 'captured button must expose pressed feedback');
  let result = input.handleTouchEnd(40, 50);
  assert(result.captured && typeof result.onTap === 'function',
    'touch end inside the original button must prepare one activation');
  result.onTap({ x: 40, y: 50 });
  assert(taps === 1, 'touch end inside the original button must activate exactly once');
  assert(!input.isPressed(rect), 'button must clear pressed feedback after release');

  input = createInput();
  input.handleTouchStart(40, 50);
  input.handleTouchMove(200, 200);
  result = input.handleTouchEnd(200, 200);
  assert(result.captured && result.onTap === null,
    'sliding outside before release must cancel button activation');
  assert(taps === 1, 'a canceled slide must not activate the button');

  input = createInput();
  input.handleTouchStart(40, 50);
  assert(input.handleTouchCancel(), 'touch cancel must clear a captured button');
  result = input.handleTouchEnd(40, 50);
  assert(!result.captured && result.onTap === null,
    'release after touch cancel must remain inactive');
  assert(taps === 1, 'touch cancel must not activate the button');

  input = new InputManager();
  input.addHitArea(rect, () => {
    taps += 1;
  });
  input.addHitArea({
    x: 160,
    y: 30,
    width: 120,
    height: 52,
  }, () => {
    taps += 10;
  });
  input.handleTouchStart(40, 50);
  input.handleTouchMove(180, 50);
  result = input.handleTouchEnd(180, 50);
  assert(result.captured && result.onTap === null,
    'sliding from one button to another must activate neither button');
  assert(taps === 1, 'cross-button sliding must not run either callback');
}

function verifyResultOverlayLayout() {
  [
    { width: 320, height: 568, safeTop: 58 },
    { width: 375, height: 667, safeTop: 64 },
    { width: 430, height: 932, safeTop: 72 },
  ].forEach(device => {
    const layout = getResultOverlayLayout(device.width, device.height, device.safeTop);
    assert(layout.cardX >= 16, 'result card must keep horizontal screen padding');
    assert(layout.cardY >= device.safeTop, 'result card must stay below the capsule safe area');
    assert(layout.cardX + layout.cardWidth <= device.width - 16,
      'result card must stay within the screen width');
    assert(layout.cardY + layout.cardHeight <= device.height,
      'result card must stay within the screen height');
  });

  const ctx = createContextMock();
  const input = new InputManager();
  drawResultOverlay(ctx, input, {
    width: 375,
    height: 667,
    safeTop: 64,
    progress: 1,
    presentation: {
      badge: '胜',
      badgeFill: '#14382B',
      title: '你获胜',
      subtitle: '漂亮，这一局拿下了',
      color: '#14382B',
      note: '棋逢对手，不妨再来一盘',
    },
    players: [
      {
        nickname: '黑棋棋手',
        label: '黑棋 · 先手',
        piece: 'black',
        isWinner: true,
        isSelf: true,
      },
      {
        nickname: '白棋棋手',
        label: '白棋 · 后手',
        piece: 'white',
      },
    ],
    primaryAction: {
      text: '再来一局',
      onTap() {},
    },
    secondaryAction: {
      text: '返回首页',
      onTap() {},
    },
  });
  assert(ctx.texts.includes('胜'), 'result overlay must render the Chinese seal badge');
  assert(ctx.texts.includes('你获胜'), 'result overlay must render the result title');
  assert(ctx.texts.includes('VS'), 'result overlay must render both players as a versus pair');
  assert(ctx.texts.includes('再来一局'), 'result overlay must render the rematch action');
  assert(ctx.texts.includes('返回首页'), 'result overlay must render the home action');
  assert(input.hitAreas.length === 2, 'result overlay must expose only its two actions');

  const animatingInput = new InputManager();
  drawResultOverlay(createContextMock(), animatingInput, {
    width: 375,
    height: 667,
    safeTop: 64,
    progress: 0.5,
    presentation: {
      badge: '负',
      badgeFill: '#A83232',
      title: '本局惜败',
      subtitle: '调整思路，再来一盘',
      color: '#A83232',
      note: '下一局重新来过',
    },
    players: [
      { nickname: '黑棋', label: '黑棋 · 先手', piece: 'black' },
      { nickname: '白棋', label: '白棋 · 后手', piece: 'white', isWinner: true },
    ],
    primaryAction: { text: '再来一局', onTap() {} },
    secondaryAction: { text: '返回首页', onTap() {} },
  });
  assert(animatingInput.hitAreas.length === 0,
    'result actions must stay locked during the entrance animation');
}

function verifyLocalResultUsesOverlay() {
  const runtime = {
    width: 375,
    height: 667,
    canvas: {},
    wx: createWxMock(),
    manager: {
      render() {},
      go() {},
    },
  };
  const scene = new LocalGameScene(runtime);
  scene.gameOver = true;
  scene.resultText = '黑棋获胜';
  scene.resultReveal.show();

  const ctx = createContextMock();
  const input = new InputManager();
  scene.render(ctx, input);
  assert(ctx.texts.includes('黑棋获胜'),
    'local match must present its result in the full-screen overlay');
  assert(ctx.texts.includes('胜'),
    'local match result overlay must include the Chinese seal badge');
  assert(input.hitAreas.length === 2,
    'finished local match must expose only rematch and home actions');
}

function verifyRuntimeButtonGesture() {
  const { wx, runtime } = createStartedRuntime();
  const home = runtime.manager.current;
  const x = runtime.manager.runtime.width / 2;
  const y = home.getLayout().actionY + 146 + 25;

  wx.touchHandler({
    touches: [{ clientX: x, clientY: y }],
  });
  assert(runtime.manager.current.constructor.name === 'HomeScene',
    'touch start on a navigation button must not change scenes');
  assert(runtime.manager.input.hasActiveTouch(),
    'touch start on a navigation button must hold a pending gesture');

  wx.touchMoveHandler({
    touches: [{ clientX: 4, clientY: 4 }],
  });
  wx.touchEndHandler({
    changedTouches: [{ clientX: 4, clientY: 4 }],
  });
  assert(runtime.manager.current.constructor.name === 'HomeScene',
    'sliding away before release must cancel navigation');

  wx.touchHandler({
    touches: [{ clientX: x, clientY: y }],
  });
  wx.touchEndHandler({
    changedTouches: [{ clientX: x, clientY: y }],
  });
  assert(runtime.manager.current.constructor.name === 'LocalGameScene',
    'releasing inside the original navigation button must change scenes');
}

function verifyLocalBoardTap() {
  const { runtime } = createStartedRuntime();
  runtime.manager.go('localGame');
  const scene = runtime.manager.current;
  const x = scene.boardRect.x + scene.boardRect.width / 2;
  const y = scene.boardRect.y + scene.boardRect.height / 2;

  runtime.manager.handleTouch({ touches: [{ clientX: x, clientY: y }] });

  assert(scene.board[7][7] === board.BLACK, 'local board tap must place a black piece');
  assert(scene.currentPlayer === board.WHITE, 'local board tap must pass the turn to white');
}

function verifyJoinKeypad() {
  const { runtime } = createStartedRuntime();
  runtime.manager.go('joinRoom');
  const scene = runtime.manager.current;
  ['1', '2', '3', '退格', '4', '5', '6', '7'].forEach(key => scene.handleKey(key));
  assert(scene.roomId === '124567', 'join keypad must support digits and backspace');
}

async function verifyJoinClipboardPaste() {
  const { wx, runtime } = createStartedRuntime();
  wx.getClipboardData = options => {
    options.success({ data: '好友发来的房间号：654321' });
  };

  runtime.manager.go('joinRoom');
  const scene = runtime.manager.current;
  await flush();

  assert(scene.roomId === '654321', 'join scene must extract a six-digit room id from clipboard text');
  assert(scene.feedback.includes('剪贴板识别'), 'join scene must show automatic clipboard success feedback');
  assert(!scene.checkingClipboard, 'automatic clipboard check must settle after success');
}

async function verifyInvalidClipboardFeedback() {
  const { wx, runtime } = createStartedRuntime();
  wx.getClipboardData = options => {
    options.success({ data: '这里没有房间号 1234567' });
  };

  runtime.manager.go('joinRoom');
  const scene = runtime.manager.current;
  await flush();

  assert(scene.roomId === '', 'invalid clipboard text must not fill the room id');
  assert(scene.error === '', 'automatic clipboard detection must not show a blocking error');
  assert(scene.feedback.includes('手动输入'), 'invalid clipboard content must fall back to manual input guidance');
  assert(!scene.checkingClipboard, 'automatic clipboard check must settle after invalid content');
}

function verifySharedRoomLaunch() {
  const wx = createWxMock();
  wx.launchOptions = { query: { roomId: '246810' } };
  const runtime = createRuntime(wx);
  runtime.start();

  assert(runtime.manager.current.constructor.name === 'JoinRoomScene', 'shared launch must open JoinRoomScene');
  assert(runtime.manager.current.roomId === '246810', 'shared launch must prefill the room id');
  assert(runtime.manager.current.feedback.includes('好友邀请'), 'shared launch must explain the prefilled source');
}

function verifyHotSharedRoomEntry() {
  const { wx, runtime } = createStartedRuntime();
  wx.showHandler({ query: { roomId: '135790' } });

  assert(runtime.manager.current.constructor.name === 'JoinRoomScene', 'hot shared entry must open JoinRoomScene');
  assert(runtime.manager.current.roomId === '135790', 'hot shared entry must prefill the room id');
}

function verifyRoomShare() {
  const payload = buildRoomSharePayload('123456');
  assert(payload.query === 'roomId=123456', 'share payload must carry the room id query');
  assert(payload.title.includes('棋遇五子棋'), 'share payload must use the official game brand');

  const wx = createWxMock();
  const scene = new WaitRoomScene({
    wx,
    manager: {
      render() {},
    },
  }, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });
  scene.inviteFriend();

  assert(wx.lastSharePayload.query === 'roomId=123456', 'wait scene must share the active room id');
  assert(scene.copyMessage.includes('好友列表'), 'wait scene must show invite guidance');
}

function verifyTouchLayouts() {
  const width = 375;
  const height = 667;
  const ctx = createContextMock();
  const scenes = [
    new HomeScene(createLayoutRuntime(width, height)),
    new JoinRoomScene(createLayoutRuntime(width, height), {}),
    new LocalGameScene(createLayoutRuntime(width, height)),
    new CreateRoomScene(createLayoutRuntime(width, height)),
    new WaitRoomScene(createLayoutRuntime(width, height), {
      roomId: '123456',
      role: 'host',
      color: 'black',
    }),
    new OnlineGameScene(createLayoutRuntime(width, height), {
      roomId: '123456',
      role: 'host',
      color: 'black',
    }),
    new ProfileScene(createLayoutRuntime(width, height)),
  ];

  scenes[5].statusText = '轮到你落子（黑棋）';
  scenes[5].isMyTurn = true;
  scenes[5].boardLocked = false;

  scenes.forEach(scene => {
    const input = new InputManager();
    scene.render(ctx, input);
    assert(input.hitAreas.length > 0, `${scene.constructor.name} must expose touch targets`);
    input.hitAreas.forEach(({ rect }) => {
      assert(rect.x >= 0 && rect.y >= 0, `${scene.constructor.name} touch target must start on screen`);
      assert(rect.x + rect.width <= width, `${scene.constructor.name} touch target must fit screen width`);
      assert(rect.y + rect.height <= height, `${scene.constructor.name} touch target must fit screen height`);
      assert(rect.height >= 38, `${scene.constructor.name} touch target must remain finger friendly`);
    });
  });
}

function verifySafeAreaAvoidsCapsule() {
  const runtime = createLayoutRuntime(375, 667);
  runtime.wx.menuButtonRect = {
    top: 38,
    bottom: 74,
    left: 280,
    right: 350,
    width: 70,
    height: 36,
  };

  const home = new HomeScene(runtime);
  const profile = new ProfileScene(runtime);
  const online = new OnlineGameScene(runtime, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });
  const input = new InputManager();
  online.render(createContextMock(), input);

  assert(home.getLayout().playerY > runtime.wx.menuButtonRect.bottom,
    'home player card must begin below the WeChat capsule');
  assert(profile.getLayout().titleY > runtime.wx.menuButtonRect.bottom,
    'profile title must begin below the WeChat capsule');
  assert(online.boardRect.y > runtime.wx.menuButtonRect.bottom,
    'online board and controls must begin below the WeChat capsule');
}

function createLayoutRuntime(width, height) {
  return {
    width,
    height,
    wx: createWxMock(),
    cloud: {},
    manager: {
      go() {},
      render() {},
    },
  };
}

async function verifyStaleJoinCannotChangeScene() {
  const { runtime } = createStartedRuntime();
  let resolveJoin;
  runtime.manager.runtime.cloud.joinRoom = () => new Promise(resolve => {
    resolveJoin = resolve;
  });

  runtime.manager.go('joinRoom');
  const scene = runtime.manager.current;
  scene.roomId = '123456';
  scene.joinRoom();
  runtime.manager.go('home');
  resolveJoin({ role: 'guest', color: 'white' });
  await Promise.resolve();
  await Promise.resolve();

  assert(runtime.manager.current.constructor.name === 'HomeScene', 'stale join response must not leave HomeScene');
}

function verifyHostReturnsToWaitingWhenGuestLeaves() {
  const transitions = [];
  const runtime = {
    manager: {
      go(name, params) {
        transitions.push({ name, params });
      },
      render() {},
    },
  };
  const scene = new OnlineGameScene(runtime, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });

  scene.active = true;
  scene.applyRoom({
    status: 'waiting',
    currentTurn: 'host',
    board: board.createBoard(),
  });

  assert(transitions.length === 1, 'guest departure must trigger one scene transition');
  assert(transitions[0].name === 'waitRoom', 'host must return to WaitRoomScene after guest departure');
  assert(transitions[0].params.roomId === '123456', 'host must keep the existing room id');
  assert(transitions[0].params.role === 'host', 'host role must be preserved while waiting');
}

async function verifyWaitingHostPollingFallback() {
  const transitions = [];
  let roomStatus = 'waiting';
  const scene = new WaitRoomScene({
    cloud: {
      getRoom() {
        return Promise.resolve({ status: roomStatus });
      },
      watchRoom() {
        return { close() {} };
      },
    },
    manager: {
      go(name, params) {
        transitions.push({ name, params });
      },
      render() {},
    },
  }, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });

  scene.onEnter();
  await flush();
  assert(scene.pollTimer !== null,
    'waiting room must keep a lightweight poll fallback when the realtime watcher stays silent');

  roomStatus = 'playing';
  await scene.loadRoom();
  scene.applyRoom({ status: 'playing' });
  assert(transitions.length === 1, 'watch and poll racing must enter the match exactly once');
  assert(transitions[0].name === 'onlineGame',
    'poll fallback must move the host into OnlineGameScene after the guest joins');
  scene.onExit();
}

async function verifyCreateRoomAutoEntersWaiting() {
  const transitions = [];
  const scene = new CreateRoomScene({
    cloud: {
      createRoom() {
        return Promise.resolve('246810');
      },
      leaveRoom() {
        return Promise.resolve();
      },
    },
    manager: {
      go(name, params) {
        transitions.push({ name, params });
      },
      render() {},
    },
  });

  scene.onEnter();
  await flush();
  await flush();

  assert(transitions.length === 1, 'successful room creation must transition exactly once');
  assert(transitions[0].name === 'waitRoom',
    'successful room creation must enter WaitRoomScene without another button press');
  assert(transitions[0].params.roomId === '246810',
    'automatic waiting-room transition must preserve the created room id');
  assert(transitions[0].params.role === 'host' && transitions[0].params.color === 'black',
    'room creator must enter the waiting room as the black host');
}

async function verifyAbandonedCreateCleansRoom() {
  let resolveCreate;
  let cleanedRoomId = '';
  const transitions = [];
  const scene = new CreateRoomScene({
    cloud: {
      createRoom() {
        return new Promise(resolve => {
          resolveCreate = resolve;
        });
      },
      leaveRoom(roomId) {
        cleanedRoomId = roomId;
        return Promise.resolve();
      },
    },
    manager: {
      go(name, params) {
        transitions.push({ name, params });
      },
      render() {},
    },
  });

  scene.onEnter();
  scene.onExit();
  resolveCreate('975310');
  await flush();
  await flush();

  assert(transitions.length === 0,
    'a stale create response must not pull the user away from the current scene');
  assert(cleanedRoomId === '975310',
    'a room created after the user leaves must be cleaned up instead of becoming orphaned');
}

async function verifyCreateFailureCanRetry() {
  let attempts = 0;
  const transitions = [];
  const scene = new CreateRoomScene({
    cloud: {
      createRoom() {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new Error('网络暂不可用'));
        return Promise.resolve('112233');
      },
      leaveRoom() {
        return Promise.resolve();
      },
    },
    manager: {
      go(name, params) {
        transitions.push({ name, params });
      },
      render() {},
    },
  });

  scene.onEnter();
  await flush();
  await flush();
  assert(scene.error === '网络暂不可用', 'create failure must show its actionable error');
  assert(!scene.loading, 'create failure must unlock the retry action');

  scene.createRoom();
  await flush();
  await flush();
  assert(attempts === 2, 'retry must issue one new room creation request');
  assert(transitions.length === 1 && transitions[0].name === 'waitRoom',
    'successful retry must automatically enter the waiting room');
}

async function verifyCopyFeedback(SceneType, params, label) {
  const toasts = [];
  let copiedText = '';
  const runtime = {
    wx: {
      setClipboardData(options) {
        copiedText = options.data;
        options.success();
      },
      showToast(options) {
        toasts.push(options);
      },
    },
    manager: {
      render() {},
    },
  };
  const scene = new SceneType(runtime, params);
  if (!scene.roomId) scene.roomId = '123456';

  scene.copyRoomId();
  await flush();

  assert(copiedText === '123456', `${label} must copy the full room id`);
  assert(scene.copyMessage.includes('已复制'), `${label} must show persistent copy success feedback`);
  assert(toasts.some(toast => toast.title === '房间号已复制'), `${label} must show a success toast`);
  assert(!scene.copying, `${label} copy button must unlock after success`);
}

async function verifyCopyFailureFeedback() {
  const toasts = [];
  const scene = new WaitRoomScene({
    wx: {
      setClipboardData(options) {
        options.fail({ errMsg: 'clipboard denied' });
      },
      showToast(options) {
        toasts.push(options);
      },
    },
    manager: {
      render() {},
    },
  }, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  });

  scene.copyRoomId();
  await flush();

  assert(scene.copyMessage.includes('复制失败'), 'copy failure must be visible on the Canvas page');
  assert(toasts.some(toast => toast.title === '复制失败，请重试'), 'copy failure must show a toast');
  assert(!scene.copying, 'copy button must unlock after failure');
}

async function main() {
  verifyRuntimeBoot();
  verifyForegroundCanvasRecovery();
  verifyButtonReleaseSemantics();
  verifyResultOverlayLayout();
  verifyLocalResultUsesOverlay();
  verifyRuntimeButtonGesture();
  await verifyWeChatLogin();
  await verifyIncompleteProfileIsNotMarkedComplete();
  verifyPrivacyAuthorizationFailure();
  verifyOnlinePlayerProfiles();
  await verifySurrenderConfirmation();
  verifyLocalBoardTap();
  verifyJoinKeypad();
  await verifyJoinClipboardPaste();
  await verifyInvalidClipboardFeedback();
  verifySharedRoomLaunch();
  verifyHotSharedRoomEntry();
  verifyRoomShare();
  verifyTouchLayouts();
  verifySafeAreaAvoidsCapsule();
  await verifyStaleJoinCannotChangeScene();
  verifyHostReturnsToWaitingWhenGuestLeaves();
  await verifyWaitingHostPollingFallback();
  await verifyCreateRoomAutoEntersWaiting();
  await verifyAbandonedCreateCleansRoom();
  await verifyCreateFailureCanRetry();
  verifyRematchAndDepartureViewState();
  await verifyCopyFeedback(WaitRoomScene, {
    roomId: '123456',
    role: 'host',
    color: 'black',
  }, 'wait room scene');
  await verifyCopyFailureFeedback();
  console.log('mini game runtime checks ok');
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});
