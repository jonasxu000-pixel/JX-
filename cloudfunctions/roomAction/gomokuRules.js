// Canonical adjudicator. Keep the deployed roomAction copy byte-identical.
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];
const FOUL_NAMES = {
  overline: '黑棋长连禁手',
  doubleFour: '黑棋双四禁手',
  doubleThree: '黑棋双三禁手',
};
const inside = (board, r, c) => r >= 0 && c >= 0 && r < board.length && c < board[r].length;
function lineLength(board, r, c, dr, dc, piece) {
  let length = 1;
  for (const sign of [-1, 1]) {
    let rr = r + dr * sign,
      cc = c + dc * sign;
    while (inside(board, rr, cc) && board[rr][cc] === piece) {
      length += 1;
      rr += dr * sign;
      cc += dc * sign;
    }
  }
  return length;
}
function lengths(board, r, c, piece) {
  return DIRECTIONS.map(([dr, dc]) => lineLength(board, r, c, dr, dc, piece));
}
function cells(board, r, c, dr, dc, start, size) {
  const result = [];
  for (let i = 0; i < size; i += 1) {
    const rr = r + (start + i) * dr,
      cc = c + (start + i) * dc;
    if (!inside(board, rr, cc)) return null;
    result.push([rr, cc]);
  }
  return result;
}
const keyOf = (points) =>
  points
    .map(([r, c]) => r * 15 + c)
    .sort((a, b) => a - b)
    .join(',');
function fours(board, r, c) {
  const found = new Set();
  for (const [dr, dc] of DIRECTIONS) {
    for (let start = -4; start <= 0; start += 1) {
      const points = cells(board, r, c, dr, dc, start, 5);
      if (!points || points.some(([rr, cc]) => board[rr][cc] === 2)) continue;
      const stones = points.filter(([rr, cc]) => board[rr][cc] === 1);
      const gaps = points.filter(([rr, cc]) => board[rr][cc] === 0);
      if (stones.length !== 4 || gaps.length !== 1) continue;
      const [rr, cc] = gaps[0];
      board[rr][cc] = 1;
      const exact = lineLength(board, rr, cc, dr, dc, 1) === 5;
      board[rr][cc] = 0;
      if (exact) found.add(keyOf(stones));
    }
  }
  return found.size;
}
function possibleThrees(board, r, c) {
  const found = new Map();
  for (const [dr, dc] of DIRECTIONS) {
    for (let start = -4; start <= -1; start += 1) {
      const points = cells(board, r, c, dr, dc, start, 6);
      if (!points || board[points[0][0]][points[0][1]] || board[points[5][0]][points[5][1]])
        continue;
      const inner = points.slice(1, 5);
      const stones = inner.filter(([rr, cc]) => board[rr][cc] === 1);
      const gaps = inner.filter(([rr, cc]) => board[rr][cc] === 0);
      if (
        stones.length !== 3 ||
        gaps.length !== 1 ||
        !stones.some(([rr, cc]) => rr === r && cc === c)
      )
        continue;
      const [rr, cc] = gaps[0];
      board[rr][cc] = 1;
      // Both ends must make EXACTLY five; an overline end is a false open four.
      const open = [points[0], points[5]].every(([er, ec]) => {
        board[er][ec] = 1;
        const exact = lineLength(board, er, ec, dr, dc, 1) === 5;
        board[er][ec] = 0;
        return exact;
      });
      const makesFive = lengths(board, rr, cc, 1).includes(5);
      board[rr][cc] = 0;
      if (!open || makesFive) continue;
      const key = keyOf(stones);
      if (!found.has(key)) found.set(key, new Map());
      found.get(key).set(rr * 15 + cc, [rr, cc]);
    }
  }
  return [...found.values()].map((extensions) => [...extensions.values()]);
}
function blackResult(board, r, c, memo) {
  const lens = lengths(board, r, c, 1);
  // RIF 9.2: simultaneously completing an exact five takes precedence.
  if (lens.includes(5)) return { win: true, foul: null };
  if (lens.some((n) => n > 5)) return { win: false, foul: 'overline' };
  const key = `${r},${c}:${board.map((row) => row.join('')).join('')}`;
  if (memo.has(key)) return memo.get(key);
  let foul = fours(board, r, c) > 1 ? 'doubleFour' : null;
  if (!foul) {
    const candidates = possibleThrees(board, r, c);
    if (candidates.length > 1) {
      let genuine = 0;
      for (const extensions of candidates) {
        const legal = extensions.some(([rr, cc]) => {
          board[rr][cc] = 1;
          // Recursive legality is necessary for false threes (RIF 9.3).
          const result = blackResult(board, rr, cc, memo);
          board[rr][cc] = 0;
          return !result.win && !result.foul;
        });
        if (legal && ++genuine > 1) {
          foul = 'doubleThree';
          break;
        }
      }
    }
  }
  const result = { win: false, foul };
  memo.set(key, result);
  return result;
}
// Called AFTER placing a stone. Never mutates the caller's board.
function adjudicate(board, row, col, piece, ruleSet = 'freestyle') {
  if (ruleSet === 'renju' && piece === 1) {
    const result = blackResult(
      board.map((line) => line.slice()),
      row,
      col,
      new Map(),
    );
    return { ...result, foulText: FOUL_NAMES[result.foul] || '' };
  }
  const lens = lengths(board, row, col, piece);
  return {
    win: ruleSet === 'exact' ? lens.includes(5) : lens.some((n) => n >= 5),
    foul: null,
    foulText: '',
  };
}
function openingError(board, row, col, piece, rules) {
  return rules.openingCenter &&
    piece === 1 &&
    board.every((line) => line.every((x) => !x)) &&
    (row !== 7 || col !== 7)
    ? '本局约定黑棋首手落在天元（棋盘中心）'
    : '';
}
module.exports = { adjudicate, openingError, FOUL_NAMES };
