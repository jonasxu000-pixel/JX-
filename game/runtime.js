const SceneManager = require('./core/sceneManager');
const CloudClient = require('./core/cloudClient');
const HomeScene = require('./scenes/homeScene');
const LocalGameScene = require('./scenes/localGameScene');
const CreateRoomScene = require('./scenes/createRoomScene');
const JoinRoomScene = require('./scenes/joinRoomScene');
const WaitRoomScene = require('./scenes/waitRoomScene');
const OnlineGameScene = require('./scenes/onlineGameScene');

const CLOUD_ENV = 'cloud1-d3glf789q33b91507';

function getSystemInfo(wxApi) {
  if (wxApi.getSystemInfoSync) return wxApi.getSystemInfoSync();
  return { screenWidth: 375, screenHeight: 667, pixelRatio: 1 };
}

function createRuntime(wxApi) {
  const canvas = wxApi.createCanvas();
  const ctx = canvas.getContext('2d');
  const system = getSystemInfo(wxApi);
  const dpr = system.pixelRatio || 1;
  const width = system.screenWidth || 375;
  const height = system.screenHeight || 667;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  if (ctx.scale) ctx.scale(dpr, dpr);

  const cloud = new CloudClient(wxApi);
  const manager = new SceneManager({
    wx: wxApi,
    canvas,
    ctx,
    width,
    height,
    cloud,
  });

  manager.register('home', HomeScene);
  manager.register('localGame', LocalGameScene);
  manager.register('createRoom', CreateRoomScene);
  manager.register('joinRoom', JoinRoomScene);
  manager.register('waitRoom', WaitRoomScene);
  manager.register('onlineGame', OnlineGameScene);

  function start() {
    if (wxApi.cloud && wxApi.cloud.init) {
      wxApi.cloud.init({
        env: CLOUD_ENV,
        traceUser: true,
      });
      cloud.warmUp().catch(() => {});
    }

    if (wxApi.onTouchStart) {
      wxApi.onTouchStart(event => manager.handleTouch(event));
    }

    if (wxApi.onShow) {
      wxApi.onShow(() => manager.resume());
    }

    manager.go('home');
  }

  return {
    start,
    manager,
    canvas,
  };
}

module.exports = {
  CLOUD_ENV,
  createRuntime,
};
