const assert = require('assert/strict');
const { performance } = require('perf_hooks');
const rules = require('../utils/board');
const ai = require('../utils/gomokuAi');
const puzzles = require('../utils/puzzles');
const progress = require('../utils/progressStore');
const matchStore = require('../utils/localMatchStore');
const roomSession = require('../utils/roomSession');
const { createFeedback } = require('../utils/gameFeedback');
const { createTestRuntime } = require('./practice-test-support');

function winningMoves(state, piece) { return ai.collectCandidates(state).filter(move => ai.isWinningMove(state, move.row, move.col, piece)); }

function solve(task) {
  let slices = 0; let maximumMs = 0;
  while (slices < 5000) {
    const started = performance.now(); const result = task.step(4);
    maximumMs = Math.max(maximumMs, performance.now() - started);
    slices += 1;
    if (result.done) return { ...result, slices, maximumMs };
  }
  throw new Error('AI search did not terminate');
}

function verifyPuzzles() {
  const ids = new Set();
  for (const puzzle of puzzles.PUZZLES) {
    assert(!ids.has(puzzle.id)); ids.add(puzzle.id);
    const state = puzzles.createPosition(puzzle);
    const pieces = [...puzzle.black, ...puzzle.white].map(point => point.join(':'));
    assert.equal(new Set(pieces).size, pieces.length, `${puzzle.id} has overlapping pieces`);
    for (let row = 0; row < 15; row += 1) for (let col = 0; col < 15; col += 1) {
      if (state[row][col]) assert(!rules.checkWin(state, row, col, state[row][col]), `${puzzle.id} already finished`);
    }
    const [row, col] = puzzle.solution;
    assert.equal(state[row][col], 0);
    state[row][col] = rules.BLACK;
    if (puzzle.moves === 1) { assert(rules.checkWin(state, row, col, rules.BLACK), `${puzzle.id} one-move solution invalid`); continue; }
    assert(!rules.checkWin(state, row, col, rules.BLACK));
    // Exhaust ALL legal white replies, not just the author's expected AI response.
    for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
      if (state[r][c]) continue;
      state[r][c] = rules.WHITE;
      assert(!rules.checkWin(state, r, c, rules.WHITE), `${puzzle.id}: white can win first`);
      assert(winningMoves(state, rules.BLACK).length > 0, `${puzzle.id}: white can refute the advertised solution`);
      state[r][c] = rules.EMPTY;
    }
  }
  console.log('12 puzzle solutions verified against every legal defending reply');
}

function verifyAI() {
  const state = rules.createBoard(); state[7][7] = 1; state[6][7] = 2; state[8][8] = 1; state[7][8] = 2;
  const original = JSON.stringify(state);
  const strategies = new Set();
  let maximumMs = 0;
  for (const difficulty of ['easy','normal','hard']) {
    const result = solve(ai.createMoveTask(state, 2, 1, { difficulty, random: () => 0.99 }));
    assert(result.move && state[result.move.row][result.move.col] === 0);
    assert.equal(JSON.stringify(state), original, 'search mutated live board');
    strategies.add(result.move.strategy); maximumMs = Math.max(maximumMs, result.maximumMs);
    const threat = rules.createBoard(); [3,4,5,6].forEach(col => { threat[7][col] = 1; }); threat[7][2] = 2;
    const block = solve(ai.createMoveTask(threat, 2, 1, { difficulty }));
    assert.equal(block.move.row, 7); assert.equal(block.move.col, 7);
  }
  assert.deepEqual([...strategies], ['relaxed', 'heuristic', 'reply-search'], 'difficulty must change the actual analysis');
  const varied = rules.createBoard();
  [[4,11],[5,3],[6,3],[7,5],[8,10],[10,11]].forEach(([r,c]) => { varied[r][c] = 1; });
  [[7,4],[8,3],[8,5],[10,7],[11,10],[11,11]].forEach(([r,c]) => { varied[r][c] = 2; });
  const normal = ai.selectMove(varied);
  const hard = solve(ai.createMoveTask(varied, 2, 1, { difficulty: 'hard' })).move;
  assert(normal.row !== hard.row || normal.col !== hard.col, 'reply search must influence actual chosen intersections');
  const cancelled = ai.createMoveTask(state, 2, 1, { difficulty: 'hard' }); cancelled.step(1); cancelled.cancel();
  assert.equal(cancelled.step().cancelled, true); assert.equal(cancelled.step().move, null);
  console.log(`AI difficulty, tactics and cancellation verified; maximum measured desktop slice ${maximumMs.toFixed(2)} ms`);
}

function verifyProgress() {
  const { wx, storage } = createTestRuntime();
  const result = { id: 'one', mode: 'ai', difficulty: 'normal', outcome: 'win', title: '进阶人机' };
  assert.equal(progress.record(wx, result).earned, 20);
  assert.equal(progress.record(wx, result).earned, 0);
  assert.equal(progress.read(wx).ai.normal.win, 1);
  assert.equal(progress.record(wx, { id: 'p1', mode: 'puzzle', puzzleId: 'p01', outcome: 'win', stars: 1 }).earned, 25);
  assert.equal(progress.record(wx, { id: 'p2', mode: 'puzzle', puzzleId: 'p01', outcome: 'win', stars: 3 }).earned, 0);
  assert.equal(progress.read(wx).puzzles.p01, 3);
  assert(progress.goals(progress.read(wx))[0].done);
  assert(progress.setSetting(wx, 'sound', false));
  const newWx = { getStorageSync(key) { return storage[key]; } };
  assert.equal(progress.read(newWx).xp, 45, 'growth must survive runtime recreation');
  assert.equal(progress.read(newWx).settings.sound, false);
  wx.setStorageSync = () => { throw new Error('storage full'); };
  assert.equal(progress.record(wx, { ...result, id: 'two' }).saved, false);
  assert.equal(progress.read(wx).ai.normal.win, 2, 'failed persistence must preserve this session only');
  console.log('Growth persistence, deduplication, goals and storage-failure behavior verified');
}

function tapIntersection(scene, row, col) {
  const rect = scene.boardRect; const padding = rect.width * 0.08; const cell = (rect.width - 2 * padding) / 14;
  scene.handleTouch(rect.x + padding + col * cell, rect.y + padding + row * cell);
}

function verifyScenes() {
  const { runtime, wx, storage } = createTestRuntime();
  runtime.manager.go('aiGame', { difficulty: 'hard' });
  let scene = runtime.manager.current;
  tapIntersection(scene, 7, 7);
  const id = scene.id;
  scene.onHide(); assert.equal(scene.aiTimer, null); assert.equal(scene.aiTask, null);
  const resume = matchStore.load(wx); assert.equal(resume.currentPlayer, 2);
  runtime.manager.go('home'); runtime.manager.go('aiGame', { resume });
  scene = runtime.manager.current; assert.equal(scene.id, id); assert.equal(scene.board[7][7], 1);
  scene.clearAiTimer(); scene.startAiSearch(); scene.restart();
  assert.equal(scene.aiTask, null); assert.equal(scene.aiTimer, null); assert(scene.board.every(row => row.every(piece => piece === 0)));
  scene.changeDifficulty('easy'); assert.equal(scene.difficulty, 'easy');
  tapIntersection(scene, 7, 7); scene.changeDifficulty('hard');
  assert.equal(scene.difficulty, 'easy', 'mid-game difficulty needs confirmation');
  wx.modal.success({ confirm: true }); assert.equal(scene.difficulty, 'hard');
  runtime.manager.go('puzzleGame', { puzzleId: 'p01' }); scene = runtime.manager.current;
  tapIntersection(scene, 0, 0); assert(scene.gameOver); assert.equal(progress.read(wx).puzzles.p01, undefined);
  scene.restart(); scene.toggleHint(); scene.onHide();
  const hinted = matchStore.load(wx); assert(hinted && hinted.usedHint);
  runtime.manager.go('puzzleGame', { puzzleId: 'p01', resume: hinted }); scene = runtime.manager.current;
  tapIntersection(scene, 7, 8); assert(scene.gameOver); assert.equal(progress.read(wx).puzzles.p01, 1);
  assert.equal(matchStore.load(wx), null);
  const xp = progress.read(wx).xp; scene.finishGame('你获胜'); assert.equal(progress.read(wx).xp, xp);
  runtime.manager.render(); assert.equal(runtime.manager.input.hitAreas.length, 2, 'puzzle result must block underlying controls');
  runtime.manager.go('puzzleGame', { puzzleId: 'p02' }); assert.equal(runtime.manager.current.puzzle.id, 'p02');
  runtime.manager.go('puzzleGame', { puzzleId: 'p12' }); assert.equal(runtime.manager.current.puzzle, null, 'locked puzzles must reject direct navigation');
  runtime.manager.go('home');
  runtime.manager.go('aiGame'); assert.equal(runtime.manager.current.difficulty, 'hard', 'selected difficulty must persist across scenes');
  runtime.manager.current.finishGame('AI 获胜');
  assert.equal(runtime.manager.input.hitAreas.length, 2, 'AI result must block difficulty controls beneath the overlay');
  runtime.manager.go('home');
  storage[matchStore.KEY] = { version: 1, board: [[1]] }; assert.equal(matchStore.load(wx), null);
  console.log('Difficulty selection, retry, hints, unlocks, result deduplication and cold restart verified');
}

function verifyPuzzleRuntime() {
  const { runtime, wx } = createTestRuntime();
  for (const puzzle of puzzles.PUZZLES) {
    runtime.manager.go('puzzleGame', { puzzleId: puzzle.id });
    const scene = runtime.manager.current;
    assert.equal(scene.puzzle.id, puzzle.id);
    tapIntersection(scene, ...puzzle.solution);
    if (!scene.gameOver) {
      scene.clearAiTimer();
      const result = solve(ai.createMoveTask(scene.board, 2, 1, { difficulty: 'hard' }));
      scene.performAiMove(result.move);
      assert(!scene.gameOver);
      const winning = winningMoves(scene.board, 1)[0]; assert(winning);
      tapIntersection(scene, winning.row, winning.col);
    }
    assert.equal(scene.resultText, '你获胜');
    assert.equal(progress.read(wx).puzzles[puzzle.id], 3);
  }
  assert.equal(progress.read(wx).xp, 300, 'all first puzzle clears must award exactly 300 XP');
  runtime.manager.go('home');
  console.log('All 12 puzzles completed through the actual scene, defender and unlock flow');
}

function verifyRecoveryAndFeedback() {
  const { wx, storage } = createTestRuntime();
  const room = { roomId: '123456', viewId: 'a'.repeat(36), role: 'host' };
  roomSession.save(wx, room);
  const restartedWx = { getStorageSync(key) { return storage[key]; } };
  assert.equal(roomSession.read(restartedWx).roomId, '123456');
  roomSession.clear(wx, '654321'); assert(roomSession.read(wx));
  roomSession.clear(wx, '123456'); assert.equal(roomSession.read(wx), null);
  roomSession.save(wx, room); storage[roomSession.KEY].at -= 7 * 60 * 60 * 1000;
  assert.equal(roomSession.read(wx), null);
  roomSession.save(wx, room, 'waiting'); storage[roomSession.KEY].at -= 31 * 60 * 1000;
  assert.equal(roomSession.read(wx), null, 'waiting-room recovery must respect its shorter server lifetime');
  let sounds = 0; let vibrations = 0;
  wx.createInnerAudioContext = () => ({ stop() {}, play() { sounds += 1; }, onError() {} });
  wx.vibrateShort = () => { vibrations += 1; };
  const feedback = createFeedback(wx); feedback.move(); assert.equal(sounds, 1); assert.equal(vibrations, 0);
  progress.setSetting(wx, 'sound', false); progress.setSetting(wx, 'vibration', true);
  feedback.move(); assert.equal(sounds, 1); assert.equal(vibrations, 1);
  feedback.move(false); assert.equal(vibrations, 1, 'opponent move must not vibrate');
  feedback.pause();
  console.log('Friend-room reference recovery and actual feedback settings verified');
}

async function verifyOnlineRevision() {
  const { runtime, wx } = createTestRuntime();
  const OnlineGameScene = require('../game/scenes/onlineGameScene');
  let resolveRead; let rejectRead; let watcher; let watchError;
  const cloud = {
    getRoom() { return new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }); },
    watchRoom(id, change, error) { watcher = change; watchError = error; return { close() {} }; },
  };
  const scene = new OnlineGameScene({ ...runtime.manager.runtime, wx, cloud, manager: { go() {}, render() {} } }, { roomId: '123456', viewId: 'a'.repeat(36), role: 'host' });
  scene.onEnter();
  const old = { status: 'playing', host: { nickname: '黑方' }, guest: { nickname: '白方' }, currentTurn: 'host', board: rules.createBoard(), lastMove: null };
  const recent = JSON.parse(JSON.stringify(old)); recent.board[7][7] = 1; recent.currentTurn = 'guest'; recent.lastMove = { row: 7, col: 7, piece: 1 };
  watcher(recent); resolveRead(old); await new Promise(setImmediate);
  assert.equal(scene.board[7][7], 1, 'late read must not overwrite newer watch state');
  scene.onResume();
  const newest = JSON.parse(JSON.stringify(recent)); newest.board[7][8] = 2; newest.currentTurn = 'host'; newest.lastMove = { row: 7, col: 8, piece: 2 };
  watcher(newest); rejectRead(new Error('network timeout')); await new Promise(setImmediate);
  assert.equal(scene.boardLocked, false, 'late failed read must not lock a successfully synced new turn');
  watchError(new Error('disconnected')); assert.equal(scene.boardLocked, true);
  assert(scene.statusText.includes('重新同步'));
  scene.onExit();
  console.log('Online stale-read ordering and disconnected-board locking verified');
}

function verifyLayouts() {
  for (const [width, height] of [[320,568],[375,667],[390,844],[430,932]]) {
    const { runtime } = createTestRuntime(width, height);
    for (const [name, params] of [['home',{}],['aiGame',{}],['localGame',{}],['puzzleList',{}],['puzzleGame',{puzzleId:'p01'}],['growth',{}]]) {
      runtime.manager.go(name, params);
      const scene = runtime.manager.current;
      for (const tab of name === 'growth' ? ['goals','history','settings'] : [null]) {
        if (tab) scene.tab = tab;
        runtime.manager.render();
        for (const { rect } of runtime.manager.input.hitAreas) {
          assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 0.01 && rect.y + rect.height <= height + 0.01, `${name}/${tab} target outside ${width}x${height}`);
          assert(rect.height >= 38, `${name} target too small`);
        }
      }
    }
    runtime.manager.go('home');
  }
  for (const [width, height] of [[375,667],[430,932]]) {
    const { runtime, wx, ctx } = createTestRuntime(width, height);
    wx.getMenuButtonBoundingClientRect = () => ({ bottom: 96, right: width - 20 });
    runtime.manager.runtime.bottomInset = 34;
    const InputManager = require('../game/core/inputManager');
    for (const name of ['home','aiGame','puzzleGame','puzzleList','growth','createRoom','joinRoom','waitRoom','profile','localGame','onlineGame']) {
      const Scene = runtime.manager.sceneTypes[name];
      const scene = new Scene({ ...runtime.manager.runtime, manager: { go() {}, render() {} } }, { puzzleId: 'p01', roomId: '123456', viewId: 'a'.repeat(36), role: 'host' });
      const input = new InputManager();
      scene.render(ctx, input);
      input.hitAreas.forEach(({ rect }) => {
        assert(rect.y >= 96 && rect.y + rect.height <= height - 34 + 0.01, `${name} control overlaps notch/home indicator at ${width}x${height}`);
      });
      if (scene.onExit) scene.onExit();
    }
  }
  console.log('New flows verified at four mobile screen sizes');
}

async function main() {
  verifyPuzzles(); verifyAI(); verifyProgress(); verifyScenes(); verifyPuzzleRuntime(); verifyRecoveryAndFeedback(); verifyLayouts();
  await verifyOnlineRevision();
  console.log('Practice and growth checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
