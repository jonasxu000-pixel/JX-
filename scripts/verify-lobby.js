const assert = require('assert/strict');
const fs = require('fs');
const { createTestRuntime } = require('./practice-test-support');
const progress = require('../utils/progressStore');
const { savePlayer } = require('../utils/playerSession');
const forcing = require('../utils/forcingSearch');
const defense = require('../utils/puzzleDefense');
const puzzles = require('../utils/puzzles');

function tap(manager, rect) {
  const touch = { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
  manager.handleTouchStart({ touches: [touch] });
  manager.handleTouchEnd({ changedTouches: [touch] });
}

function verifyLobbyAndSettings() {
  const { runtime, wx } = createTestRuntime(); const manager = runtime.manager;
  const audio = []; const native = [];
  wx.createInnerAudioContext = () => {
    const context = { plays: 0, pauses: 0, play() { this.plays += 1; }, pause() { this.pauses += 1; }, stop() {}, onError(callback) { this.fail = callback; } };
    audio.push(context); return context;
  };
  wx.createUserInfoButton = options => { const button = { options, onTap() {}, destroy() { this.destroyed = true; } }; native.push(button); return button; };
  manager.go('home'); let home = manager.current;
  assert.equal(native[0].options.style.width, 48, 'native login must cover only the compact avatar');
  manager.runtime.cloud.createRoom = () => new Promise(() => {});
  tap(manager, home.getActionLayout().create);
  assert.equal(manager.current.constructor.name, 'MatchSetupScene', 'room rules must be agreed before creating a friend room');
  tap(manager,{x:20,y:667-18-106,width:335,height:44});
  assert.equal(manager.current.constructor.name,'CreateRoomScene');
  assert(native[0].destroyed);
  manager.go('home'); home = manager.current;
  tap(manager, home.getActionLayout().join);
  assert.equal(manager.current.constructor.name, 'JoinRoomScene', 'join-room action must be available directly from the lobby');
  manager.go('home'); home = manager.current;
  savePlayer(wx, 'local-test-only', { nickName: '棋友测试' }); manager.go('home'); home = manager.current;
  tap(manager, { x: 20, y: home.getLayout().playerY, width: 48, height: 48 });
  assert.equal(home.sheet, 'player');
  const y = Math.max(home.getLayout().playerY - 2, (667 - 266) / 2);
  tap(manager, { x: 40, y: y + 201, width: 295, height: 44 }); assert.equal(manager.current.constructor.name, 'GrowthScene');
  manager.go('home'); home = manager.current;
  tap(manager, home.getActionLayout().settings); assert.equal(manager.current.constructor.name, 'SettingsScene');
  const settings = manager.current;
  const rows = manager.input.hitAreas.slice(0,4).map(item => item.rect);
  assert.equal(progress.read(wx).settings.music, false);
  tap(manager, rows[1]); assert.equal(progress.read(wx).settings.music, true);
  const music = audio.find(context => context.src === 'assets/lobby-music.wav');
  assert(music && music.loop && music.plays === 1, 'music switch must start a real loop');
  manager.runtime.feedback.interact(); assert.equal(music.plays, 1, 'ordinary taps must not restart music');
  manager.runtime.feedback.pause(); assert(music.pauses >= 1);
  manager.runtime.feedback.syncMusic(); assert.equal(music.plays, 1, 'settings must not restart audio while backgrounded');
  manager.runtime.feedback.resume(); assert.equal(music.plays, 2);
  tap(manager, rows[1]); assert.equal(progress.read(wx).settings.music, false); assert(music.pauses >= 2);
  tap(manager, rows[3]); assert.equal(progress.read(wx).settings.motion, false);
  const freshWx = { getStorageSync: key => wx.getStorageSync(key) };
  assert.equal(progress.read(freshWx).settings.motion, false, 'motion choice must survive relaunch');
  assert.equal(settings.saveError, false);
  manager.go('home');
  home = manager.current;
  const difficulty = manager.input.hitAreas.find(({rect}) => rect.y === home.getActionLayout().difficultyY && rect.x > 200);
  tap(manager, difficulty.rect); assert.equal(progress.read(wx).settings.difficulty,'hard');
  tap(manager, home.getActionLayout().ai); assert.equal(manager.current.difficulty,'hard');
  const practice = manager.current;
  const rect = practice.boardRect;
  practice.handleTouch(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const previousId = practice.id; practice.onHide(); manager.go('home'); home = manager.current;
  tap(manager, home.getActionLayout().fresh);
  assert.equal(manager.current.mode,'ai'); assert.equal(manager.current.moves,0);
  assert.notEqual(manager.current.id, previousId, 'fresh entry must start a new match');
  manager.go('home');
  console.log('Compact avatar, direct friend-room actions, independent settings, real music loop and lifecycle verified');
}

function verifyAnimation() {
  const { runtime, wx } = createTestRuntime(); const manager = runtime.manager;
  const canvas = manager.runtime.canvas; let queued = null; let cancelled = 0;
  canvas.requestAnimationFrame = callback => { queued = callback; return 1; };
  canvas.cancelAnimationFrame = () => { queued = null; cancelled += 1; };
  manager.go('home'); const home = manager.current;
  assert.equal(home.frame, 1);
  home.animationStart = Date.now() - 2300; queued();
  assert.equal(home.frame, null, 'lobby entrance must settle after its short animation');
  assert.equal(home.animationStart, 0);
  home.startAnimation(); home.onHide(); assert(cancelled > 0); assert.equal(home.frame,null);
  progress.setSetting(wx,'motion',false); home.onResume(); assert.equal(home.frame,null);
  manager.go('settings'); assert.equal(home.active,false);
  console.log('Lobby animation duration, reduced motion and background cancellation verified');
  for (const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
    const test = createTestRuntime(width,height);
    test.wx.getMenuButtonBoundingClientRect = () => ({ bottom: 96, right: width - 20 });
    test.runtime.manager.runtime.bottomInset = 34;
    test.runtime.manager.go('home');
    test.runtime.manager.input.hitAreas.forEach(({rect}) => {
      assert(rect.y >= 108 && rect.y + rect.height <= height - 34);
      assert(rect.height >= 38 && rect.width >= 44);
    });
    const scene = test.runtime.manager.current;
    assert(scene.getActionLayout().noteY + 5 <= height - 34, 'footer text must clear the gesture area on small screens');
    scene.onExit();
  }
  console.log('Lobby touch targets and footer verified including 320x568 with a tall capsule and gesture inset');
}

function verifySearchBudgetAndCancellation() {
  let maximumMs = 0;
  for (const puzzle of puzzles.CHALLENGES) {
    const board = puzzles.createPosition(puzzle); const snapshot = JSON.stringify(board);
    const task = forcing.createTask(board,1,puzzle.moves); let result; let slices = 0;
    do { const t = performance.now(); result = task.step(4); maximumMs = Math.max(maximumMs,performance.now() - t); assert(++slices < 10000); } while (!result.done);
    assert(result.proof); assert.equal(JSON.stringify(board), snapshot);
    const cancelled = forcing.createTask(board); cancelled.step(1); cancelled.cancel(); assert(cancelled.step().cancelled);
    const first = puzzle.solution; board[first[0]][first[1]] = 1;
    const defending = defense.createTask(board, puzzle.moves - 1); defending.cancel(); assert(defending.step().cancelled);
  }
  const png = fs.readFileSync('assets/lobby-sprites.png');
  assert.equal(png.readUInt32BE(16),1254); assert.equal(png.readUInt32BE(20),1254);
  assert(png.length < 1500000, 'lobby art must remain bounded in the package');
  console.log(`Challenge search and cancellation verified; desktop maximum slice ${maximumMs.toFixed(2)} ms; atlas ${(png.length / 1024).toFixed(0)} KiB`);
}

function verifyOptionalAssets() {
  const failed = createTestRuntime(); let imageAttempts = 0;
  failed.wx.createImage = () => { imageAttempts += 1; throw new Error('image decoder unavailable'); };
  failed.wx.createUserInfoButton = () => { throw new Error('native view unavailable'); };
  failed.runtime.start();
  const home = failed.runtime.manager.current;
  assert.equal(home.constructor.name,'HomeScene');
  assert.equal(home.userInfoButton,null);
  failed.runtime.manager.render(); failed.runtime.manager.render();
  assert.equal(imageAttempts,2,'failed optional artwork must not be retried on every redraw');
  tap(failed.runtime.manager,home.getActionLayout().ai);
  assert.equal(failed.runtime.manager.current.constructor.name,'AiGameScene','offline practice must stay available when optional assets fail');
  failed.runtime.manager.go('settings');

  const loaded = createTestRuntime(); const images = []; let paints = 0;
  loaded.ctx.fillRect = () => { paints += 1; };
  loaded.wx.createImage = () => { const image = {}; images.push(image); return image; };
  loaded.runtime.manager.go('home'); assert.equal(images.length,2);
  loaded.runtime.manager.suspend(); const before = paints;
  images.forEach(image => image.onload()); loaded.runtime.manager.render();
  assert.equal(paints,before,'late image loads must not repaint a backgrounded game');
  loaded.runtime.manager.resume(); assert(paints > before);
  loaded.runtime.manager.go('settings'); loaded.runtime.manager.go('home');
  assert.equal(images.length,2,'ready artwork must be reused across lobby visits');
  loaded.runtime.manager.suspend();
  const snapshot = createTestRuntime(); let reads = 0;
  const getStorage = snapshot.wx.getStorageSync;
  snapshot.wx.getStorageSync = key => { reads += 1; return getStorage.call(snapshot.wx,key); };
  snapshot.runtime.manager.go('home'); const entryReads = reads;
  for (let i = 0; i < 20; i += 1) snapshot.runtime.manager.render();
  assert.equal(reads,entryReads,'lobby redraws must not repeatedly query native storage');
  snapshot.runtime.manager.suspend(); progress.setSetting(snapshot.wx,'difficulty','hard');
  snapshot.runtime.manager.resume(); assert.equal(snapshot.runtime.manager.current.growth.settings.difficulty,'hard','foreground entry must refresh settings');
  snapshot.runtime.manager.suspend();
  console.log('Optional artwork/native-control failures, background repaint cancellation and asset reuse verified');
}

verifyLobbyAndSettings(); verifyAnimation(); verifySearchBudgetAndCancellation(); verifyOptionalAssets();
