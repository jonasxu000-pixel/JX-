const { createRuntime, CLOUD_ENV } = require('../game/runtime');
const board = require('../utils/board');
const CreateRoomScene = require('../game/scenes/createRoomScene');
const HomeScene = require('../game/scenes/homeScene');
const JoinRoomScene = require('../game/scenes/joinRoomScene');
const LocalGameScene = require('../game/scenes/localGameScene');
const OnlineGameScene = require('../game/scenes/onlineGameScene');
const WaitRoomScene = require('../game/scenes/waitRoomScene');
const InputManager = require('../game/core/inputManager');
const { buildRoomSharePayload } = require('../utils/share');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function createContextMock() {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    scale: noop,
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
    fillText: noop,
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
    showHandler: null,
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
      return { screenWidth: 375, screenHeight: 667, pixelRatio: 1 };
    },
    onTouchStart(handler) {
      this.touchHandler = handler;
    },
    onShow(handler) {
      this.showHandler = handler;
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
  assert(wx.lastUserInfoButton.destroyed, 'native login button must be destroyed after login');
  assert(wx.cloud.callFunctionCalls.some(call => call.name === 'login'), 'WeChat login must call the login cloud function');

  runtime.manager.go('home');
  assert(runtime.manager.current.player.openId === 'test-wechat-openid', 'stored WeChat login must survive scene recreation');

  runtime.manager.go('profile');
  const profileScene = runtime.manager.current;
  profileScene.editNickname();
  const confirmNickname = wx.keyboardHandler;
  confirmNickname({ value: '自定义棋手' });
  assert(profileScene.player.nickname === '自定义棋手', 'player must be able to choose a custom nickname');
  profileScene.chooseCustomAvatar();
  assert(profileScene.player.avatarMode === 'custom', 'player must be able to choose an album avatar');
  assert(profileScene.player.customAvatarPath.includes('saved/avatar.jpg'), 'album avatar must be persisted locally');

  runtime.manager.go('home');
  assert(runtime.manager.current.player.nickname === '自定义棋手', 'custom profile must persist on the home scene');
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
  assert(typeof wx.touchHandler === 'function', 'runtime must register touch input');
  assert(typeof wx.showHandler === 'function', 'runtime must register foreground recovery');
  assert(runtime.manager.current.constructor.name === 'HomeScene', 'runtime must boot into HomeScene');
  assert(
    wx.cloud.callFunctionCalls.some(call => call.name === 'roomAction' && call.data.action === 'ping'),
    'runtime must prewarm roomAction on startup',
  );
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
  assert(payload.title.includes('你棋没我硬'), 'share payload must use the official game brand');

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
  ];

  scenes[3].roomId = '123456';
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
  const scene = new CreateRoomScene({
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
  });
  scene.roomId = '123456';

  scene.copyRoomId();
  await flush();

  assert(scene.copyMessage.includes('复制失败'), 'copy failure must be visible on the Canvas page');
  assert(toasts.some(toast => toast.title === '复制失败，请重试'), 'copy failure must show a toast');
  assert(!scene.copying, 'copy button must unlock after failure');
}

async function main() {
  verifyRuntimeBoot();
  await verifyWeChatLogin();
  verifyLocalBoardTap();
  verifyJoinKeypad();
  await verifyJoinClipboardPaste();
  await verifyInvalidClipboardFeedback();
  verifySharedRoomLaunch();
  verifyHotSharedRoomEntry();
  verifyRoomShare();
  verifyTouchLayouts();
  await verifyStaleJoinCannotChangeScene();
  verifyHostReturnsToWaitingWhenGuestLeaves();
  verifyRematchAndDepartureViewState();
  await verifyCopyFeedback(CreateRoomScene, {}, 'create room scene');
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
