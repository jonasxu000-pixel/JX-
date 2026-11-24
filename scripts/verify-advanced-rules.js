const assert = require('assert/strict');
const fs = require('fs');
const { performance } = require('perf_hooks');
const gomoku = require('../utils/gomokuRules');
const matchRules = require('../utils/matchRules');
const progress = require('../utils/progressStore');
const roomSession = require('../utils/roomSession');
const { createTestRuntime } = require('./practice-test-support');
const Input = require('../game/core/inputManager');
const Online = require('../game/scenes/onlineGameScene');
const fresh = () => Array.from({ length: 15 }, () => Array(15).fill(0));
function position(stones, whites = [], point = [7, 7]) {
  const board = fresh();
  stones.forEach(([r, c]) => {
    board[r][c] = 1;
  });
  whites.forEach(([r, c]) => {
    board[r][c] = 2;
  });
  board[point[0]][point[1]] = 1;
  return board;
}
function judge(stones, expected, whites = [], point = [7, 7]) {
  // Rotation/reflection must not change a ruling, including diagonals.
  for (let rotation = 0; rotation < 4; rotation += 1)
    for (const reflect of [false, true]) {
      const transform = ([r, c]) => {
        if (reflect) c = 14 - c;
        for (let i = 0; i < rotation; i += 1) [r, c] = [c, 14 - r];
        return [r, c];
      };
      const p = transform(point),
        board = position(stones.map(transform), whites.map(transform), p),
        before = JSON.stringify(board);
      assert.equal(gomoku.adjudicate(board, ...p, 1, 'renju').foul, expected);
      assert.equal(JSON.stringify(board), before, 'adjudication must not mutate a live board');
    }
}
const cross = [
  [7, 6],
  [7, 8],
  [6, 7],
  [8, 7],
];
judge(cross, 'doubleThree');
judge(
  [
    [7, 5],
    [7, 6],
    [7, 8],
    [5, 7],
    [6, 7],
    [8, 7],
  ],
  'doubleFour',
);
judge(
  [
    [7, 3],
    [7, 5],
    [7, 6],
    [7, 9],
  ],
  'doubleFour',
); // Two fours in the SAME direction.
judge(
  [
    [7, 4],
    [7, 5],
    [7, 6],
    [7, 8],
    [7, 9],
  ],
  'overline',
);
judge(cross, null, [
  [7, 5],
  [7, 9],
]); // Closed apparent three.
judge([...cross, [7, 3], [7, 11]], null); // Both open-four extensions have an overline end.
judge([...cross, [5, 5], [6, 5], [8, 5], [5, 9], [6, 9], [8, 9]], null); // Extensions are double fours.
const recursiveFalse = [...cross, [6, 5], [8, 5], [6, 4], [8, 6], [6, 9], [8, 9], [6, 10], [8, 8]];
judge(recursiveFalse, null); // Extensions are forbidden double threes (RIF 9.3).
const extension = position(recursiveFalse);
extension[7][5] = 1;
assert.equal(gomoku.adjudicate(extension, 7, 5, 1, 'renju').foul, 'doubleThree');
const exactPriority = position([
  [7, 5],
  [7, 6],
  [7, 8],
  [7, 9],
  [4, 7],
  [5, 7],
  [6, 7],
  [8, 7],
  [9, 7],
]);
assert(
  gomoku.adjudicate(exactPriority, 7, 7, 1, 'renju').win,
  'exact five takes precedence over a simultaneous foul',
);
const overline = position([
  [7, 4],
  [7, 5],
  [7, 6],
  [7, 8],
  [7, 9],
]);
assert(gomoku.adjudicate(overline, 7, 7, 1, 'freestyle').win);
assert(!gomoku.adjudicate(overline, 7, 7, 1, 'exact').win);
const whiteOverline = overline.map((row) => row.map((x) => (x ? 2 : 0)));
assert(gomoku.adjudicate(whiteOverline, 7, 7, 2, 'renju').win, 'white overline is a win');
assert.equal(gomoku.openingError(fresh(), 7, 7, 1, { openingCenter: true }), '');
assert(gomoku.openingError(fresh(), 0, 0, 1, { openingCenter: true }));
assert.equal(gomoku.openingError(position([]), 0, 0, 1, { openingCenter: true }), '');
assert.equal(
  fs.readFileSync('utils/gomokuRules.js', 'utf8'),
  fs.readFileSync('cloudfunctions/roomAction/gomokuRules.js', 'utf8'),
  'client/server adjudicators must match',
);
assert.deepEqual(matchRules.normalize(), {
  version: 2,
  turnSeconds: 30,
  allowUndo: true,
  undoLimit: 1,
  undoScope: 'move',
  ruleSet: 'freestyle',
  openingCenter: false,
  rematch: 'loser',
});
const test = createTestRuntime(),
  { wx, storage } = test;
storage[progress.KEY] = {
  version: 1,
  xp: 123,
  puzzles: { c01: 3 },
  history: [],
  settings: { turnSeconds: 0, undoEnabled: true, sound: false, difficulty: 'hard' },
};
let data = progress.read(wx);
assert.equal(data.xp, 123);
assert.equal(data.puzzles.c01, 3);
assert.equal(data.settings.sound, false);
assert.equal(data.settings.turnSeconds, 30);
assert.equal(data.settings.undoLimit, 1);
progress.setRules(wx, {
  turnSeconds: 120,
  undoLimit: 3,
  ruleSet: 'renju',
  openingCenter: true,
  rematch: 'alternate',
  undoScope: 'round',
});
assert.equal(progress.read(wx).settings.undoLimit, 3);
assert.equal(progress.read(wx).settings.ruleSet, 'renju');
progress.setRules(wx, matchRules.normalize());
assert.equal(progress.read(wx).xp, 123);
// Exercise both sides of the folding control with the actual production scenes.
for (const [w, h] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
]) {
  const t = createTestRuntime(w, h),
    manager = t.runtime.manager;
  t.wx.getMenuButtonBoundingClientRect = () => ({ bottom: 96, right: w - 20 });
  manager.runtime.bottomInset = 34;
  for (const advanced of [false, true]) {
    manager.go('matchSetup', { mode: 'friend' });
    manager.current.advanced = advanced;
    manager.render();
    const areas = manager.input.hitAreas;
    for (const { rect } of areas)
      assert(
        rect.y >= 108 &&
          rect.y + rect.height <= h - 34 &&
          rect.height >= 38 &&
          rect.x >= 0 &&
          rect.x + rect.width <= w + 0.01,
      );
    for (let i = 0; i < areas.length; i += 1)
      for (let j = i + 1; j < areas.length; j += 1) {
        const a = areas[i].rect,
          b = areas[j].rect;
        assert(
          !(
            a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height
          ),
          'expanded rules must not overlap on a small screen',
        );
      }
  }
  manager.go('home');
}
function tap(scene, r, c) {
  const padding = scene.boardRect.width * 0.08,
    cell = (scene.boardRect.width - padding * 2) / 14;
  const x = scene.boardRect.x + padding + c * cell;
  const y = scene.boardRect.y + padding + r * cell;
  scene.handleTouch(x, y);
  scene.handleTouch(x, y);
}
const manager = test.runtime.manager;
manager.go('localGame', { rules: { turnSeconds: 0, ruleSet: 'renju', openingCenter: true } });
let local = manager.current;
tap(local, 0, 0);
assert.equal(local.history.length, 0, 'local center opening must reject without moving');
local.board = position(cross);
local.board[7][7] = 0;
tap(local, 7, 7);
assert(local.gameOver && local.winnerPiece === 2 && local.resultText.includes('双三'));
manager.go('localGame', { rules: { turnSeconds: 0, undoLimit: 3, undoScope: 'round' } });
local = manager.current;
tap(local, 7, 7);
local.requestUndo();
assert(!local.pendingUndo, 'a full round needs two stones');
tap(local, 7, 8);
local.requestUndo();
local.respondUndo(true);
assert.equal(local.history.length, 0);
assert.equal(local.undoUsed[1], 1);
manager.go('aiGame', { rules: { turnSeconds: 0, undoLimit: 3 } });
const ai = manager.current;
for (let i = 0; i < 3; i += 1) {
  tap(ai, 7 - i, 7 - i);
  ai.clearAiTimer();
  ai.performAiMove({ row: 7 - i, col: 8 });
}
const saved = require('../utils/localMatchStore').load(wx);
assert(
  saved && saved.undoStack.length === 3 && saved.undoLeft === 3,
  'three-undo AI saves must survive validation',
);
for (let i = 0; i < 3; i += 1) ai.undo();
assert.equal(ai.undoLeft, 0);
assert.equal(ai.moves, 0);
manager.go('home');
const runtime = { ...test.runtime.manager.runtime, manager: { render() {}, go() {} }, cloud: {} };
const online = new Online(runtime, {
  roomId: '123456',
  viewId: 'a'.repeat(36),
  role: 'host',
  color: 'black',
});
online.active = true;
online.clockSynced = true;
online.applyRoom({
  status: 'playing',
  host: { nickname: '房主', color: 'white' },
  guest: { nickname: '好友', color: 'black' },
  currentTurn: 'guest',
  board: fresh(),
  rules: matchRules.normalize(),
  turnDeadline: Date.now() + 30000,
  moveCount: 0,
});
assert.equal(online.color, 'white');
assert.equal(online.currentPlayer, 1);
assert(!online.isMyTurn);
assert.equal(online.getResultPlayers()[0].piece, 'white');
assert.equal(roomSession.read(wx).color, 'white');
online.render(runtime.ctx, new Input());
online.onExit();
// Informational desktop timing; it is not a mobile performance acceptance claim.
let maximum = 0;
for (let i = 0; i < 100; i += 1) {
  const b = position(i % 2 ? recursiveFalse : cross);
  const start = performance.now();
  gomoku.adjudicate(b, 7, 7, 1, 'renju');
  maximum = Math.max(maximum, performance.now() - start);
}
const { drawBoard } = require('../game/renderers/boardRenderer');
const overlineBoard = fresh();
[2, 3, 4, 5, 6, 7].forEach((c) => { overlineBoard[7][c] = 1; });
const strokes = [];
const mockDrawCtx = new Proxy(
  {
    stroke() { strokes.push(this.strokeStyle); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  },
  { get(t, k) { return k in t ? t[k] : () => {}; } },
);
drawBoard(mockDrawCtx, overlineBoard, { row: 7, col: 5, piece: 1 }, { x: 0, y: 0, width: 320, height: 320 }, { ruleSet: 'exact', showWinLine: true });
assert(!strokes.includes('#EAC87C'), 'exact mode must not draw winning gold line on overline');
strokes.length = 0;
const exactFiveBoard = fresh();
[3, 4, 5, 6, 7].forEach((c) => { exactFiveBoard[7][c] = 1; });
drawBoard(mockDrawCtx, exactFiveBoard, { row: 7, col: 7, piece: 1 }, { x: 0, y: 0, width: 320, height: 320 }, { ruleSet: 'exact', showWinLine: true });
assert(strokes.includes('#EAC87C'), 'exact mode must draw winning gold line on exact five');
console.log(
  `Advanced rules, genuine/false threes, foul precedence, exact/renju win-line guards, migration, color recovery and folded UI verified; desktop maximum ${maximum.toFixed(2)} ms`,
);
