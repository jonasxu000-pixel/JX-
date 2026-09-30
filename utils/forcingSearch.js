const rules = require('./board');

// Continuous-four search. Each non-winning attack must leave a five threat;
// every off-line white reply then loses immediately. No heuristic is a proof.
const WINDOWS = [];
for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
  for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    if (!rules.isValidPos(r + 4 * dr, c + 4 * dc)) continue;
    WINDOWS.push(Array.from({ length: 5 }, (_, i) => (r + dr * i) * 15 + c + dc * i));
  }
}

function threats(cells, piece) {
  const wins = new Set(); const attacks = new Set();
  for (const line of WINDOWS) {
    let own = 0; const empty = []; let blocked = false;
    for (const index of line) {
      const value = cells[index];
      if (value && value !== piece) { blocked = true; break; }
      if (value === piece) own += 1; else empty.push(index);
    }
    if (blocked) continue;
    if (own === 4) wins.add(empty[0]);
    else if (own === 3) empty.forEach(index => attacks.add(index));
  }
  return { wins: [...wins], attacks: [...attacks] };
}

function* search(cells, piece, remaining, meter) {
  meter.nodes += 1;
  yield;
  if (meter.nodes > meter.maxNodes) { meter.limited = true; return null; }
  const own = threats(cells, piece);
  if (own.wins.length) return { move: own.wins[0], length: 1, next: null };
  if (remaining < 2) return null;
  const opponent = piece === 1 ? 2 : 1;
  const other = threats(cells, opponent);
  if (other.wins.length > 1) return null;
  const candidates = other.wins.length ? other.wins : own.attacks;
  for (const index of candidates) {
    if (cells[index]) continue;
    cells[index] = piece;
    const follow = threats(cells, piece);
    const counter = threats(cells, opponent);
    let next = null; let reply = null;
    if (follow.wins.length && !counter.wins.length) {
      if (follow.wins.length > 1) {
        cells[index] = 0;
        return { move: index, length: 2, wins: follow.wins, next: null };
      }
      if (remaining > 2) {
        reply = follow.wins[0]; cells[reply] = opponent;
        next = yield* search(cells, piece, remaining - 1, meter);
        cells[reply] = 0;
      }
    }
    cells[index] = 0;
    if (next) return { move: index, reply, length: next.length + 1, next };
    if (meter.limited) return null;
    yield;
  }
  return null;
}

function createTask(board, piece = 1, maxMoves = 7, maxNodes = 12000) {
  const cells = board.flat(); const meter = { nodes: 0, maxNodes, limited: false };
  let cancelled = false; let result = null; let done = false;
  function* iterative() {
    for (let depth = 1; depth <= maxMoves; depth += 1) {
      const proof = yield* search(cells, piece, depth, meter);
      if (proof || meter.limited) return proof;
    }
    return null;
  }
  const iterator = iterative();
  return {
    step(budgetMs = 4) {
      if (cancelled) return { done: true, cancelled: true, proof: null };
      const started = Date.now(); let count = 0;
      while (!done && count < 12 && Date.now() - started < budgetMs) {
        const tick = iterator.next(); count += 1;
        if (tick.done) { done = true; result = tick.value; }
      }
      return { done, proof: result, nodes: meter.nodes, limited: meter.limited };
    },
    cancel() { cancelled = true; },
  };
}

function solve(board, piece = 1, maxMoves = 7, maxNodes = 12000) {
  const task = createTask(board, piece, maxMoves, maxNodes);
  let result; do { result = task.step(1000); } while (!result.done);
  return result;
}

module.exports = { createTask, solve, threats, WINDOWS };
