const forcing = require('./forcingSearch');
const ai = require('./gomokuAi');
const rules = require('./board');

function point(index) { return { row: Math.floor(index / 15), col: index % 15, strategy: 'puzzle-defense' }; }
function createTask(board, remaining = 7) {
  const state = board.map(row => row.slice());
  const cells = state.flat();
  const white = forcing.threats(cells, 2).wins;
  const black = forcing.threats(cells, 1).wins;
  let immediate = white.length ? point(white[0]) : (black.length ? point(black[0]) : null);
  let task = immediate ? null : forcing.createTask(state, rules.WHITE, 7, 2400);
  let phase = 'counter'; let cancelled = false; const start = Date.now();
  return {
    step(budget = 4) {
      if (cancelled) return { done: true, move: null, cancelled: true };
      if (immediate) return { done: true, move: immediate };
      if (phase !== 'fallback' && Date.now() - start > 650) {
        task.cancel(); task = ai.createMoveTask(state, 2, 1, { difficulty: 'hard' }); phase = 'fallback';
      }
      const result = task.step(budget);
      if (!result.done) return { done: false, move: null };
      if (phase === 'fallback') return result;
      if (result.proof) { immediate = point(result.proof.move); return { done: true, move: immediate }; }
      if (phase === 'counter') {
        // Refute a lost tempo by occupying the attacker's next forcing entry.
        phase = 'prevent'; task = forcing.createTask(state, 1, Math.max(1, remaining), 2400);
      } else {
        phase = 'fallback'; task = ai.createMoveTask(state, 2, 1, { difficulty: 'hard' });
      }
      return { done: false, move: null };
    },
    cancel() { cancelled = true; if (task) task.cancel(); },
  };
}
function selectMove(board, remaining) {
  const task = createTask(board, remaining); let result;
  do { result = task.step(4); } while (!result.done);
  return result.move;
}
module.exports = { createTask, selectMove };
