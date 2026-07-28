const { createRuntime, CLOUD_ENV } = require('../game/runtime');
const board = require('../utils/board');
const CreateRoomScene = require('../game/scenes/createRoomScene');
const OnlineGameScene = require('../game/scenes/onlineGameScene');
const WaitRoomScene = require('../game/scenes/waitRoomScene');

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
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    fillText: noop,
    createRadialGradient() {
      return { addColorStop: noop };
    },
  };
}

function createWxMock() {
  const ctx = createContextMock();
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
    setClipboardData() {},
    cloud: {
      callFunctionCalls: [],
      init(options) {
        this.initOptions = options;
      },
      callFunction(options) {
        this.callFunctionCalls.push(options);
        return Promise.resolve({ result: { success: true } });
      },
    },
  };
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
  verifyLocalBoardTap();
  verifyJoinKeypad();
  await verifyStaleJoinCannotChangeScene();
  verifyHostReturnsToWaitingWhenGuestLeaves();
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
