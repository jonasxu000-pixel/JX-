// Audit only: no production edits, SDK connection, storage or deployment.
// Coordinates in this file are zero-based [row, col].
const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const gomoku = require('../utils/gomokuRules');
const serverGomoku = require('../cloudfunctions/roomAction/gomokuRules');
const matchRules = require('../utils/matchRules');
const { createTestRuntime } = require('./practice-test-support');
const fresh = () => Array.from({ length: 15 }, () => Array(15).fill(0));
const dirs = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];
const files = [
  'utils/gomokuRules.js',
  'cloudfunctions/roomAction/gomokuRules.js',
  'game/scenes/localGameScene.js',
  'game/scenes/onlineGameScene.js',
  'cloudfunctions/roomAction/index.js',
  'utils/matchRules.js',
  'cloudfunctions/roomAction/matchRules.js',
];
const hash = (file) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.resolve(__dirname, '..', file)))
    .digest('hex');
const hashes = Object.fromEntries(files.map((file) => [file, hash(file)]));

// Minimal reproductions of OUT-OF-CONTRACT calls; these are not gameplay bugs.
const before = fresh();
[3, 4, 5, 6].forEach((c) => {
  before[7][c] = 1;
});
assert.equal(before[7][7], 0);
const prePlacement = gomoku.adjudicate(before, 7, 7, 1, 'freestyle');
assert.equal(prePlacement.win, true, 'current API assumes the center stone was already written');
const after = before.map((row) => row.slice());
after[7][7] = 1;
assert.equal(gomoku.adjudicate(after, 7, 7, 1, 'freestyle').win, true);
const preFork = fresh();
[
  [7, 6],
  [7, 8],
  [6, 7],
  [8, 7],
].forEach(([r, c]) => {
  preFork[r][c] = 1;
});
assert.equal(gomoku.adjudicate(preFork, 7, 7, 1, 'renju').foul, null);
preFork[7][7] = 1;
assert.equal(gomoku.adjudicate(preFork, 7, 7, 1, 'renju').foul, 'doubleThree');
assert.throws(() => gomoku.openingError(fresh(), 0, 0, 1, undefined), TypeError);
assert.equal(gomoku.openingError(fresh(), 0, 0, 1, matchRules.normalize()), '');
assert(gomoku.openingError(fresh(), 0, 0, 1, matchRules.normalize({ openingCenter: true })));
console.log(
  'Contract probes reproduced: pre-placement semantics and omitted-rules TypeError; valid arguments succeed.',
);

// An independently implemented oracle scans maximal runs after trial moves,
// rather than using the production five/six-cell window enumeration.
// It follows RIF 3 and 9.3. It is a test oracle, not a certified external engine.
function run(line, anchor) {
  if (line[anchor] !== 1) return null;
  let left = anchor,
    right = anchor;
  while (left > 0 && line[left - 1] === 1) left -= 1;
  while (right + 1 < line.length && line[right + 1] === 1) right += 1;
  return { left, right, length: right - left + 1 };
}
function fourGroups(line, anchor) {
  const groups = new Set();
  for (let gap = 0; gap < line.length; gap += 1) {
    if (line[gap] !== 0) continue;
    line[gap] = 1;
    const made = run(line, gap);
    if (made.length === 5 && made.left <= anchor && anchor <= made.right) {
      const stones = [];
      for (let i = made.left; i <= made.right; i += 1) if (i !== gap) stones.push(i);
      groups.add(stones.join(','));
    }
    line[gap] = 0;
  }
  return groups;
}
function threeGroups(line, anchor) {
  const groups = new Map();
  for (let extension = 0; extension < line.length; extension += 1) {
    if (line[extension] !== 0) continue;
    line[extension] = 1;
    const made = run(line, anchor);
    if (
      made.length === 4 &&
      made.left <= extension &&
      extension <= made.right &&
      made.left > 0 &&
      made.right < line.length - 1 &&
      line[made.left - 1] === 0 &&
      line[made.right + 1] === 0
    ) {
      const ends = [made.left - 1, made.right + 1];
      const exactEnds = ends.every((end) => {
        line[end] = 1;
        const five = run(line, end).length === 5;
        line[end] = 0;
        return five;
      });
      if (exactEnds) {
        const original = [];
        for (let i = made.left; i <= made.right; i += 1) if (i !== extension) original.push(i);
        const key = original.join(',');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(extension);
      }
    }
    line[extension] = 0;
  }
  return groups;
}
function lineOracle(line, anchor, memo = new Map()) {
  const key = `${anchor}:${line.join('')}`;
  if (memo.has(key)) return memo.get(key);
  const length = run(line, anchor).length;
  if (length === 5) return { win: true, foul: null };
  if (length > 5) return { win: false, foul: 'overline' };
  if (fourGroups(line, anchor).size > 1) return { win: false, foul: 'doubleFour' };
  let genuine = 0;
  for (const extensions of threeGroups(line, anchor).values()) {
    if (
      extensions.some((extension) => {
        line[extension] = 1;
        const result = lineOracle(line, extension, memo);
        line[extension] = 0;
        return !result.win && !result.foul;
      })
    )
      genuine += 1;
  }
  const result = { win: false, foul: genuine > 1 ? 'doubleThree' : null };
  memo.set(key, result);
  return result;
}
function axis(board, row, col, dr, dc) {
  let r = row,
    c = col;
  while (r - dr >= 0 && r - dr < 15 && c - dc >= 0 && c - dc < 15) {
    r -= dr;
    c -= dc;
  }
  const coords = [];
  while (r >= 0 && r < 15 && c >= 0 && c < 15) {
    coords.push([r, c]);
    r += dr;
    c += dc;
  }
  return {
    coords,
    line: coords.map(([rr, cc]) => board[rr][cc]),
    anchor: coords.findIndex(([rr, cc]) => rr === row && cc === col),
  };
}
function boardOracle(board, row, col, memo = new Map()) {
  const key = `${row},${col}:${board.map((line) => line.join('')).join('')}`;
  if (memo.has(key)) return memo.get(key);
  const axes = dirs.map(([dr, dc]) => axis(board, row, col, dr, dc));
  const lens = axes.map((a) => run(a.line, a.anchor).length);
  if (lens.includes(5)) return { win: true, foul: null };
  if (lens.some((n) => n > 5)) return { win: false, foul: 'overline' };
  if (axes.reduce((n, a) => n + fourGroups(a.line, a.anchor).size, 0) > 1)
    return { win: false, foul: 'doubleFour' };
  const candidates = [];
  for (const a of axes) {
    for (const extensions of threeGroups(a.line, a.anchor).values())
      candidates.push(extensions.map((i) => a.coords[i]));
  }
  let genuine = 0;
  if (candidates.length > 1)
    for (const extensions of candidates) {
      const legal = extensions.some(([r, c]) => {
        board[r][c] = 1;
        // A simultaneous five elsewhere cannot be counted as a THREE extension.
        const result = boardOracle(board, r, c, memo);
        board[r][c] = 0;
        return !result.win && !result.foul;
      });
      if (legal && ++genuine > 1) break;
    }
  const result = { win: false, foul: genuine > 1 ? 'doubleThree' : null };
  memo.set(key, result);
  return result;
}
let enumerated = 0;
const enumerations = [[7, 5], ...[0, 1, 2, 3, 11, 12, 13, 14].map((c) => [c, 4])];
for (const [anchor, radius] of enumerations) {
  const slots = Array.from({ length: 15 }, (_, i) => i).filter(
    (i) => i !== anchor && Math.abs(i - anchor) <= radius,
  );
  const line = Array(15).fill(0);
  line[anchor] = 1;
  const board = fresh();
  board[7] = line;
  for (let pattern = 0; pattern < 3 ** slots.length; pattern += 1) {
    let encoded = pattern;
    for (const slot of slots) {
      line[slot] = encoded % 3;
      encoded = Math.floor(encoded / 3);
    }
    const expected = lineOracle(line, anchor);
    const actual = gomoku.adjudicate(board, 7, anchor, 1, 'renju');
    assert.equal(actual.win, expected.win, `line win mismatch: ${line.join('')} @${anchor}`);
    assert.equal(actual.foul, expected.foul, `line foul mismatch: ${line.join('')} @${anchor}`);
    const length = run(line, anchor).length;
    assert.equal(gomoku.adjudicate(board, 7, anchor, 1, 'freestyle').win, length >= 5);
    assert.equal(gomoku.adjudicate(board, 7, anchor, 1, 'exact').win, length === 5);
    enumerated += 1;
  }
}
console.log(
  `${enumerated} single-line ternary positions matched a maximal-run/trial-move oracle (other axes empty).`,
);

const cases = [
  {
    name: 'corner closed threes',
    p: [0, 0],
    b: [
      [0, 1],
      [0, 2],
      [1, 0],
      [2, 0],
    ],
    foul: null,
  },
  {
    name: 'board edge blocks one three',
    p: [0, 2],
    b: [
      [0, 1],
      [0, 3],
      [1, 2],
      [2, 2],
    ],
    foul: null,
  },
  {
    name: 'one cell from edge remains a true fork',
    p: [1, 1],
    b: [
      [1, 2],
      [1, 3],
      [2, 1],
      [3, 1],
    ],
    foul: 'doubleThree',
  },
  {
    name: 'broken threes near edge',
    p: [1, 1],
    b: [
      [1, 3],
      [1, 4],
      [3, 1],
      [4, 1],
    ],
    foul: 'doubleThree',
  },
  {
    name: 'same-line apparent threes have overline ends',
    p: [7, 7],
    b: [
      [7, 4],
      [7, 6],
      [7, 9],
      [6, 7],
      [8, 7],
    ],
    foul: null,
  },
  {
    name: 'one open three is one formation',
    p: [7, 7],
    b: [
      [7, 6],
      [7, 8],
    ],
    foul: null,
  },
  {
    name: 'four plus three is legal',
    p: [7, 7],
    b: [
      [7, 5],
      [7, 6],
      [7, 8],
      [6, 7],
      [8, 7],
    ],
    foul: null,
  },
  {
    name: 'same-line different fours',
    p: [7, 7],
    b: [
      [7, 3],
      [7, 5],
      [7, 6],
      [7, 9],
    ],
    foul: 'doubleFour',
  },
  {
    name: 'one open four has two ends, not two fours',
    p: [7, 7],
    b: [
      [7, 5],
      [7, 6],
      [7, 8],
    ],
    foul: null,
  },
  {
    name: 'edge four with only one winning end',
    p: [0, 2],
    b: [
      [0, 0],
      [0, 1],
      [0, 3],
    ],
    foul: null,
  },
  {
    name: 'three directions of threes',
    p: [7, 7],
    b: [
      [7, 6],
      [7, 8],
      [6, 7],
      [8, 7],
      [6, 6],
      [8, 8],
    ],
    foul: 'doubleThree',
  },
  {
    name: 'extension would simultaneously win elsewhere',
    p: [7, 7],
    b: [
      [7, 5],
      [7, 8],
      [6, 7],
      [8, 7],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
    ],
    foul: null,
  },
  {
    name: 'recursive forbidden-three extensions',
    p: [7, 7],
    b: [
      [7, 6],
      [7, 8],
      [6, 7],
      [8, 7],
      [6, 5],
      [8, 5],
      [6, 4],
      [8, 6],
      [6, 9],
      [8, 9],
      [6, 10],
      [8, 8],
    ],
    foul: null,
  },
  {
    name: 'four extensions are forbidden',
    p: [7, 7],
    b: [
      [7, 6],
      [7, 8],
      [6, 7],
      [8, 7],
      [5, 5],
      [6, 5],
      [8, 5],
      [5, 9],
      [6, 9],
      [8, 9],
    ],
    foul: null,
  },
];
let fixed = 0;
for (const test of cases)
  for (let rotate = 0; rotate < 4; rotate += 1)
    for (const reflect of [false, true]) {
      const transform = ([r, c]) => {
        if (reflect) c = 14 - c;
        for (let i = 0; i < rotate; i += 1) [r, c] = [c, 14 - r];
        return [r, c];
      };
      const board = fresh(),
        [r, c] = transform(test.p);
      test.b.map(transform).forEach(([rr, cc]) => {
        board[rr][cc] = 1;
      });
      board[r][c] = 1;
      const original = JSON.stringify(board),
        result = gomoku.adjudicate(board, r, c, 1, 'renju');
      assert.equal(result.foul, test.foul, test.name);
      const expected = boardOracle(board, r, c);
      assert.deepEqual(
        { win: result.win, foul: result.foul },
        expected,
        test.name + ' independent oracle',
      );
      assert.deepEqual(serverGomoku.adjudicate(board, r, c, 1, 'renju'), result);
      assert.equal(JSON.stringify(board), original, test.name + ' input mutation');
      fixed += 1;
    }
console.log(
  `${fixed} fixed edge/false-three/same-line/four cases passed, including rotations and reflections.`,
);

// Minimal completed-five/overline cases on every axis, including an edge end.
let winCases = 0;
for (const [dr, dc] of dirs)
  for (const length of [5, 6])
    for (const piece of [1, 2])
      for (const ruleSet of ['freestyle', 'exact', 'renju']) {
        const board = fresh(),
          start = dc < 0 ? [0, 14] : [0, 0];
        for (let i = 0; i < length; i += 1) board[start[0] + dr * i][start[1] + dc * i] = piece;
        const result = gomoku.adjudicate(board, ...start, piece, ruleSet);
        const expectedWin =
          ruleSet === 'exact'
            ? length === 5
            : ruleSet === 'renju' && piece === 1
              ? length === 5
              : true;
        assert.equal(result.win, expectedWin, `${ruleSet} length ${length} piece ${piece}`);
        assert.equal(
          result.foul,
          ruleSet === 'renju' && piece === 1 && length === 6 ? 'overline' : null,
        );
        winCases += 1;
      }
console.log(
  `${winCases} completed-five/overline cases passed across all four axes, both colors and three modes.`,
);

// Deterministic synthetic positions test interactions across axes. They are not
// represented as legal game histories or an exhaustive proof of 225-cell play.
let seed = 0x19c1a0de,
  differential = 0;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
for (let i = 0; i < 1000; i += 1) {
  const board = fresh(),
    r = 2 + (random() % 11),
    c = 2 + (random() % 11);
  for (const [dr, dc] of dirs)
    for (const sign of [-1, 1]) {
      const rr = r + dr * sign,
        cc = c + dc * sign;
      if (random() % 3) board[rr][cc] = 1;
    }
  for (let j = 0; j < 18; j += 1) {
    const rr = r + (random() % 9) - 4,
      cc = c + (random() % 9) - 4;
    if (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && (rr !== r || cc !== c))
      board[rr][cc] = random() % 3;
  }
  board[r][c] = 1;
  const original = JSON.stringify(board),
    expected = boardOracle(board, r, c),
    actual = gomoku.adjudicate(board, r, c, 1, 'renju');
  assert.deepEqual(
    { win: actual.win, foul: actual.foul },
    expected,
    `seeded interaction ${i}: ${original} @${r},${c}`,
  );
  assert.equal(JSON.stringify(board), original);
  differential += 1;
}
console.log(`${differential} seeded cross-axis synthetic positions matched the trial-move oracle.`);

// Exercise ordinary UI moves from an empty board, alternating with WHITE.
function playLocal(blacks, last, expected) {
  const { runtime } = createTestRuntime(),
    manager = runtime.manager;
  manager.go('localGame', { rules: { turnSeconds: 0, ruleSet: 'renju' } });
  const scene = manager.current,
    whites = [
      [14, 14],
      [14, 12],
      [12, 14],
      [12, 12],
    ];
  function tap([r, c]) {
    const padding = scene.boardRect.width * 0.08,
      cell = (scene.boardRect.width - padding * 2) / 14;
    scene.handleTouch(
      scene.boardRect.x + padding + c * cell,
      scene.boardRect.y + padding + r * cell,
    );
  }
  blacks.forEach((move, i) => {
    tap(move);
    assert(!scene.gameOver, 'setup black move must remain legal');
    tap(whites[i]);
    assert(!scene.gameOver, 'setup white move must remain legal');
  });
  tap(last);
  assert.equal(scene.gameOver, expected === 'doubleThree');
  if (expected === 'doubleThree')
    assert(scene.winnerPiece === 2 && scene.resultText.includes('双三'));
  else assert.equal(scene.currentPlayer, 2);
  manager.go('home');
}
playLocal(cases[0].b, cases[0].p, null);
playLocal(cases[1].b, cases[1].p, null);
playLocal(cases[2].b, cases[2].p, 'doubleThree');
console.log(
  'Three edge scenarios passed through real local-game input with ordinary alternating moves.',
);
for (const file of files) assert.equal(hash(file), hashes[file], file + ' must remain unchanged');
console.log('Production source hashes unchanged; review verification passed.');
