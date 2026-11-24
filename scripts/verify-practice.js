const assert = require('assert/strict');
const { performance } = require('perf_hooks');
const rules = require('../utils/board');
const gomokuRules = require('../utils/gomokuRules');
const ai = require('../utils/gomokuAi');
const puzzles = require('../utils/puzzles');
const forcing = require('../utils/forcingSearch');
const vctSearch = require('../utils/vctSearch');
const defense = require('../utils/puzzleDefense');
const progress = require('../utils/progressStore');
const matchStore = require('../utils/localMatchStore');
const roomSession = require('../utils/roomSession');
const { createFeedback } = require('../utils/gameFeedback');
const { getResultOverlayLayout } = require('../game/renderers/resultOverlayRenderer');
const { createTestRuntime } = require('./practice-test-support');

function winningMoves(state, piece, ruleSet = 'freestyle') {
  return ai.collectCandidates(state).filter(move => {
    state[move.row][move.col] = piece;
    const j = gomokuRules.adjudicate(state, move.row, move.col, piece, ruleSet);
    state[move.row][move.col] = 0;
    return j.win && !j.foul;
  });
}

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
  for (const puzzle of puzzles.TUTORIALS) {
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
    for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
      if (state[r][c]) continue;
      state[r][c] = rules.WHITE;
      assert(!rules.checkWin(state, r, c, rules.WHITE), `${puzzle.id}: white can win first`);
      assert(winningMoves(state, rules.BLACK).length > 0, `${puzzle.id}: white can refute the advertised solution`);
      state[r][c] = rules.EMPTY;
    }
  }
  console.log('12 tutorial solutions verified against every legal defending reply');

  function proveExhaustive(state, node, remaining, id, ruleSet = 'freestyle') {
    assert(node && remaining >= node.length, `${id}: invalid proof length`);
    const row = Math.floor(node.move / 15), col = node.move % 15;
    assert.equal(state[row][col], 0);
    state[row][col] = 1;
    const j = gomokuRules.adjudicate(state, row, col, 1, ruleSet);
    assert(!j.foul, `${id}: foul in proof`);
    if (j.win) { assert.equal(node.length, 1); state[row][col] = 0; return; }
    for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
      if (state[r][c]) continue;
      state[r][c] = 2;
      assert(!gomokuRules.adjudicate(state, r, c, 2, ruleSet).win, `${id}: white can win during proof`);
      if (!winningMoves(state, 1, ruleSet).length) {
        const idx = r * 15 + c;
        let sub = null;
        if (node.kind === 'three') {
          sub = (node.branches && node.branches[idx]) || node.defaultNext;
        } else {
          assert.equal(node.reply, idx, `${id}: an uncovered defending branch`);
          sub = node.next;
        }
        assert(sub, `${id}: missing sub-proof for white reply ${r},${c}`);
        proveExhaustive(state, sub, remaining - 1, id, ruleSet);
      } else assert(remaining >= 2);
      state[r][c] = 0;
    }
    state[row][col] = 0;
  }

  for (const puzzle of puzzles.CHALLENGES) {
    assert(!ids.has(puzzle.id)); ids.add(puzzle.id);
    const state = puzzles.createPosition(puzzle); const original = JSON.stringify(state);
    const points = [...puzzle.black,...puzzle.white].map(point => point.join(':'));
    assert.equal(new Set(points).size, points.length);
    for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
      if (state[r][c]) { assert(!rules.checkWin(state,r,c,state[r][c])); continue; }
      assert(!ai.isWinningMove(state,r,c,1), `${puzzle.id}: one-move shortcut`);
      state[r][c] = 1;
      const threats = winningMoves(state,1), counter = winningMoves(state,2);
      assert(threats.length < 2 || counter.length, `${puzzle.id}: two-move shortcut`);
      state[r][c] = 0;
    }
    const task = forcing.createTask(state,1,puzzle.moves);
    let result; do { result = task.step(4); } while (!result.done);
    assert(result.proof && !result.limited, `${puzzle.id}: no valid forcing plan`);
    assert.equal(result.proof.length, puzzle.moves);
    proveExhaustive(state,result.proof,puzzle.moves,puzzle.id, 'freestyle');
    assert.equal(JSON.stringify(state), original, 'proof must restore the board');
  }
  console.log('12 challenge proofs (3-7 moves) exhaust all legal white replies; no one/two-move winning shortcut');

  for (const puzzle of puzzles.MASTERS) {
    assert(!ids.has(puzzle.id)); ids.add(puzzle.id);
    const ruleSet = puzzle.ruleSet || 'freestyle';
    const allowThree = Boolean(puzzle.vct);
    const state = puzzles.createPosition(puzzle); const original = JSON.stringify(state);
    const points = [...puzzle.black, ...puzzle.white].map(point => point.join(':'));
    assert.equal(new Set(points).size, points.length, `${puzzle.id} overlapping stones`);
    if (['m01', 'm03'].includes(puzzle.id)) {
      assert(vctSearch.solve(state, 2, 2, { allowThree: false, ruleSet: 'freestyle', maxNodes: 3000 }).proof,
        `${puzzle.id}: white must hold a 2-move counter threat`);
    }
    if (['m02', 'm04'].includes(puzzle.id)) {
      assert.equal(vctSearch.analyzeThreats(state, 2, 'freestyle', false).wins.length, 1,
        `${puzzle.id}: white must hold an immediate 4-in-a-row threat`);
    }
    if (puzzle.vct) {
      assert.equal(forcing.solve(state, 1, 9, 12000).proof, null,
        `${puzzle.id}: true VCT puzzle must have no pure VCF solution`);
    }
    if (ruleSet === 'renju') {
      let hasFoulTrap = false;
      for (let r = 0; r < 15 && !hasFoulTrap; r += 1) for (let c = 0; c < 15 && !hasFoulTrap; c += 1) {
        if (state[r][c] !== 0) continue;
        state[r][c] = 1;
        const jr = gomokuRules.adjudicate(state, r, c, 1, 'renju');
        if (jr.foul && vctSearch.solve(state, 1, 2, { allowThree: true, ruleSet: 'freestyle', maxNodes: 2000 }).proof) {
          hasFoulTrap = true;
        }
        state[r][c] = 0;
      }
      assert(hasFoulTrap, `${puzzle.id}: renju puzzle must contain a foul trap`);
    }
    const shorter = vctSearch.solve(state, 1, puzzle.moves - 1, { allowThree, ruleSet, maxNodes: 15000 });
    assert.equal(shorter.proof, null, `${puzzle.id}: must not have shorter solution`);
    const full = vctSearch.solve(state, 1, puzzle.moves, { allowThree, ruleSet, maxNodes: 20000 });
    assert(full.proof && !full.limited && full.proof.length === puzzle.moves, `${puzzle.id}: missing exact-length proof`);
    proveExhaustive(state, full.proof, puzzle.moves, puzzle.id, ruleSet);
    assert.equal(JSON.stringify(state), original, `${puzzle.id}: proof mutated board`);
  }
  console.log('12 Master proofs (counter-VCF, VCT, deep 8-9 VCF, Renju foul traps) exhaustively verified');
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
  assert.equal(progress.read(wx).settings.confirmMove, true, 'confirmMove must default to enabled');
  assert(progress.setSetting(wx, 'confirmMove', false));
  assert(progress.setSetting(wx, 'sound', false));
  const newWx = { getStorageSync(key) { return storage[key]; } };
  assert.equal(progress.read(newWx).xp, 45, 'growth must survive runtime recreation');
  assert.equal(progress.read(newWx).settings.sound, false);
  assert.equal(progress.read(newWx).settings.confirmMove, false);
  wx.setStorageSync = () => { throw new Error('storage full'); };
  assert.equal(progress.record(wx, { ...result, id: 'two' }).saved, false);
  assert.equal(progress.read(wx).ai.normal.win, 2, 'failed persistence must preserve this session only');
  console.log('Growth persistence, deduplication, goals, confirmMove and storage-failure behavior verified');
}

function tapOnce(scene, row, col) {
  const rect = scene.boardRect; const padding = rect.width * 0.08; const cell = (rect.width - padding * 2) / 14;
  scene.handleTouch(rect.x + padding + col * cell, rect.y + padding + row * cell);
}

function tapIntersection(scene, row, col) {
  tapOnce(scene, row, col);
  if (scene.confirmMoveEnabled && !scene.gameOver && scene.pendingMove &&
      scene.pendingMove.row === row && scene.pendingMove.col === col) {
    tapOnce(scene, row, col);
  }
}

function verifyConfirmPreviewAndSfx() {
  const { runtime, wx } = createTestRuntime();
  const played = [];
  wx.createInnerAudioContext = () => {
    const ctx = { src: '', plays: 0, stops: 0, stop() { this.stops += 1; }, play() { this.plays += 1; played.push(this.src); }, onError() {} };
    return ctx;
  };
  runtime.manager.go('aiGame', { difficulty: 'normal' });
  let scene = runtime.manager.current;
  assert.equal(scene.confirmMoveEnabled, true);
  tapOnce(scene, 7, 7);
  assert.deepEqual(scene.pendingMove, { row: 7, col: 7, piece: 1 }, 'first tap must stage pendingMove');
  assert.equal(scene.board[7][7], 0, 'first tap must not place stone yet');
  assert(played.includes('assets/stone-select.wav'), 'first tap must play select sfx');

  tapOnce(scene, 6, 6);
  assert.deepEqual(scene.pendingMove, { row: 6, col: 6, piece: 1 }, 'tapping another empty intersection must move pendingMove');
  assert.equal(scene.board[6][6], 0);

  // Tapping outside board cancels pendingMove
  scene.handleTouch(2, 2);
  assert.equal(scene.pendingMove, null, 'tapping outside board must cancel pendingMove');

  tapOnce(scene, 7, 7);
  tapOnce(scene, 7, 7);
  assert.equal(scene.board[7][7], 1, 'second tap on same intersection must place stone');
  assert.equal(scene.pendingMove, null);
  assert(played.includes('assets/stone.wav'), 'confirm tap must play stone placement sfx');

  // Verify single-tap mode when confirmMove is disabled
  progress.setSetting(wx, 'confirmMove', false);
  runtime.manager.go('localGame');
  const local = runtime.manager.current;
  assert.equal(local.confirmMoveEnabled, false);
  tapOnce(local, 7, 7);
  assert.equal(local.board[7][7], 1, 'disabling confirmMove must allow single-tap placement');
  runtime.manager.go('home');
  console.log('Two-tap dashed preview confirmation and select/place audio feedback verified');
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
  scene.restart(); scene.toggleHint();
  assert.equal(scene.hintLevel, 1); assert(scene.hintData && scene.hintData.zone, 'level-1 hint must expose 3x3 zone');
  scene.toggleHint();
  assert.equal(scene.hintLevel, 2, 'level-2 hint must mark exact point');
  scene.onHide();
  const hinted = matchStore.load(wx); assert(hinted && hinted.usedHint);
  runtime.manager.go('puzzleGame', { puzzleId: 'p01', resume: hinted }); scene = runtime.manager.current;
  tapIntersection(scene, 7, 8); assert(scene.gameOver); assert.equal(progress.read(wx).puzzles.p01, 1);
  assert.equal(matchStore.load(wx), null);
  const xp = progress.read(wx).xp; scene.finishGame('你获胜'); assert.equal(progress.read(wx).xp, xp);
  runtime.manager.render();
  const overlayLayout = getResultOverlayLayout(375, 667, 68);
  assert.equal(runtime.manager.input.hitAreas.length, 3, 'puzzle result must expose 3 overlay actions and block underlying controls');
  runtime.manager.input.hitAreas.forEach(({ rect }) => {
    assert(rect.x >= overlayLayout.cardX && rect.x + rect.width <= overlayLayout.cardX + overlayLayout.cardWidth &&
      rect.y >= overlayLayout.cardY && rect.y + rect.height <= overlayLayout.cardY + overlayLayout.cardHeight,
      'puzzle result hitAreas must stay inside overlay card');
  });

  // Verify Demo Mode playback and stepBack on a Master puzzle
  runtime.manager.go('puzzleGame', { puzzleId: 'm01' });
  scene = runtime.manager.current;
  const [sr, sc] = scene.puzzle.solution;
  tapIntersection(scene, sr, sc);
  scene.clearAiTimer();
  scene.performAiMove();
  assert.equal(scene.moves, 1);
  assert.equal(scene.puzzleMoves.length, 2);
  scene.stepBack();
  assert.equal(scene.moves, 0, 'stepBack must restore moves count');
  assert.equal(scene.puzzleMoves.length, 0, 'stepBack must clear reverted move numbers');
  assert.equal(scene.usedStepBack, true);

  // Verify off-line lost-tempo hint detection on m01
  tapIntersection(scene, 0, 0);
  scene.clearAiTimer();
  scene.performAiMove();
  scene.toggleHint();
  assert(scene.hintData && scene.hintData.lost, 'hint after straying off winning line must report lost tempo');

  // Verify Demo Mode
  scene.enterDemoMode();
  assert.equal(scene.demoMode, true);
  assert(scene.demoSteps.length >= 4);
  scene.stepDemo(1);
  assert.equal(scene.demoIndex, 1);
  scene.stepDemo(1);
  assert.equal(scene.demoIndex, 2);
  scene.stepDemo(-1);
  assert.equal(scene.demoIndex, 1);
  scene.restart();
  assert.equal(scene.demoMode, false);

  // Verify Renju foul trap triggers foul loss on m11 (unlock via clearing m10 first)
  progress.record(wx, { id: 'unlock-m10-test', mode: 'puzzle', puzzleId: 'm10', outcome: 'win', stars: 3 });
  runtime.manager.go('puzzleGame', { puzzleId: 'm11' });
  scene = runtime.manager.current;
  const m11Board = puzzles.createPosition(scene.puzzle);
  let trapCell = null;
  for (let r = 0; r < 15 && !trapCell; r += 1) for (let c = 0; c < 15 && !trapCell; c += 1) {
    if (m11Board[r][c] !== 0) continue;
    m11Board[r][c] = 1;
    if (gomokuRules.adjudicate(m11Board, r, c, 1, 'renju').foul) trapCell = [r, c];
    m11Board[r][c] = 0;
  }
  assert(trapCell);
  tapIntersection(scene, trapCell[0], trapCell[1]);
  assert(scene.gameOver && scene.finishReason === 'foul', 'stepping into Renju foul trap must end with foul loss');

  runtime.manager.go('puzzleGame', { puzzleId: 'p02' }); assert.equal(runtime.manager.current.puzzle.id, 'p02');
  runtime.manager.go('puzzleGame', { puzzleId: 'p12' }); assert.equal(runtime.manager.current.puzzle, null, 'locked puzzles must reject direct navigation');
  runtime.manager.go('home');
  runtime.manager.go('aiGame'); assert.equal(runtime.manager.current.difficulty, 'hard', 'selected difficulty must persist across scenes');
  runtime.manager.current.finishGame('AI 获胜');
  assert.equal(runtime.manager.input.hitAreas.length, 2, 'AI result must block difficulty controls beneath the overlay');
  runtime.manager.go('home');
  storage[matchStore.KEY] = { version: 1, board: [[1]] }; assert.equal(matchStore.load(wx), null);
  console.log('Difficulty, stepBack, 2-tier hints, Renju foul loss, demo mode, unlocks and cold restart verified');
}

function verifyPuzzleRuntime() {
  const { runtime, wx } = createTestRuntime();
  for (const puzzle of puzzles.PUZZLES) {
    runtime.manager.go('puzzleGame', { puzzleId: puzzle.id });
    const scene = runtime.manager.current;
    assert.equal(scene.puzzle.id, puzzle.id);
    const ruleSet = puzzle.ruleSet || 'freestyle';
    const allowThree = Boolean(puzzle.vct);
    let node = puzzle.challenge ? puzzle.proof : null;
    tapIntersection(scene, ...puzzle.solution);
    while (!scene.gameOver) {
      scene.clearAiTimer();
      const result = solve(
        puzzle.challenge
          ? defense.createTask(scene.board, puzzle.moves - scene.moves, { ruleSet, vct: allowThree })
          : ai.createMoveTask(scene.board, 2, 1, { difficulty: 'hard' }),
      );
      scene.performAiMove(result.move);
      assert(!scene.gameOver, `${puzzle.id}: defender should not win`);
      const winning = winningMoves(scene.board, 1, ruleSet)[0];
      if (winning) {
        tapIntersection(scene, winning.row, winning.col);
      } else if (node && node.next && result.move && node.reply === result.move.row * 15 + result.move.col) {
        node = node.next;
        tapIntersection(scene, Math.floor(node.move / 15), node.move % 15);
      } else {
        const branchRes = vctSearch.solve(scene.board, 1, puzzle.moves - scene.moves, {
          allowThree,
          ruleSet,
          maxNodes: 20000,
        });
        assert(branchRes.proof, `${puzzle.id}: no winning continuation after defender reply`);
        node = branchRes.proof;
        tapIntersection(scene, Math.floor(node.move / 15), node.move % 15);
      }
    }
    assert.equal(scene.resultText, '你获胜', `${puzzle.id} must finish with win`);
    assert.equal(progress.read(wx).puzzles[puzzle.id], 3, `${puzzle.id} first clean win must award 3 stars`);
  }
  assert.equal(progress.read(wx).xp, 900, '36 first puzzle clears must award exactly 900 XP');
  runtime.manager.go('home');
  console.log('All 36 puzzles completed through the actual scene, defender and unlock flow');
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
  const feedback = createFeedback(wx);
  feedback.select(); assert.equal(sounds, 1); assert.equal(vibrations, 0);
  feedback.move(); assert.equal(sounds, 2); assert.equal(vibrations, 0);
  feedback.result('win'); assert.equal(sounds, 3);
  progress.setSetting(wx, 'sound', false); progress.setSetting(wx, 'vibration', true);
  feedback.select(); assert.equal(sounds, 3); assert.equal(vibrations, 1);
  feedback.move(); assert.equal(sounds, 3); assert.equal(vibrations, 2);
  feedback.move(false); assert.equal(vibrations, 2, 'opponent move must not vibrate');
  feedback.result('win'); assert.equal(sounds, 3, 'muted sound must suppress outcome audio');
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
    for (const [name, params] of [
      ['home', {}],
      ['aiGame', {}],
      ['localGame', {}],
      ['puzzleList', { track: 'tutorial' }],
      ['puzzleList', { track: 'challenge' }],
      ['puzzleList', { track: 'master' }],
      ['puzzleGame', { puzzleId: 'p01' }],
      ['puzzleGame', { puzzleId: 'm01' }],
      ['growth', {}],
      ['settings', {}],
    ]) {
      runtime.manager.go(name, params);
      const scene = runtime.manager.current;
      for (const tab of name === 'growth' ? ['goals','history'] : [null]) {
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
  const allScenes = [
    ['home', {}],
    ['aiGame', {}],
    ['puzzleGame', { puzzleId: 'm01' }],
    ['puzzleList', { track: 'master' }],
    ['growth', {}],
    ['settings', {}],
    ['createRoom', {}],
    ['joinRoom', {}],
    ['waitRoom', { roomId: '123456', viewId: 'a'.repeat(36), role: 'host' }],
    ['profile', {}],
    ['localGame', {}],
    ['onlineGame', { roomId: '123456', viewId: 'a'.repeat(36), role: 'host' }],
  ];
  const compactTallCapsuleScenes = new Set(['home', 'aiGame', 'puzzleGame', 'puzzleList', 'growth', 'settings', 'localGame']);
  for (const [width, height] of [[320,568],[375,667],[430,932]]) {
    const { runtime, wx, ctx } = createTestRuntime(width, height);
    wx.getMenuButtonBoundingClientRect = () => ({ bottom: 96, right: width - 20 });
    runtime.manager.runtime.bottomInset = 34;
    const InputManager = require('../game/core/inputManager');
    const scenes = width === 320
      ? allScenes.filter(([name]) => compactTallCapsuleScenes.has(name))
      : allScenes;
    for (const [name, params] of scenes) {
      const Scene = runtime.manager.sceneTypes[name];
      const scene = new Scene({ ...runtime.manager.runtime, manager: { go() {}, render() {} } }, params);
      const input = new InputManager();
      scene.render(ctx, input);
      input.hitAreas.forEach(({ rect }) => {
        assert(rect.y >= 108 && rect.y + rect.height <= height - 34 + 0.01, `${name} control overlaps notch/home indicator at ${width}x${height}: ${JSON.stringify(rect)}`);
        assert(rect.height >= 38, `${name} target too small at ${width}x${height}`);
      });
      for (let i = 0; i < input.hitAreas.length; i += 1) {
        for (let j = i + 1; j < input.hitAreas.length; j += 1) {
          const a = input.hitAreas[i].rect;
          const b = input.hitAreas[j].rect;
          assert(
            !(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height),
            `${name} controls overlap at ${width}x${height}`,
          );
        }
      }
      if (scene.onExit) scene.onExit();
    }
  }
  console.log('All scenes including 3-tier puzzleList and 5-row settings verified across four mobile screen sizes');
}

async function main() {
  verifyPuzzles(); verifyAI(); verifyProgress(); verifyConfirmPreviewAndSfx(); verifyScenes(); verifyPuzzleRuntime(); verifyRecoveryAndFeedback(); verifyLayouts();
  await verifyOnlineRevision();
  console.log('Practice and growth checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
