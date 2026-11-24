const vct = require('./vctSearch');
const ai = require('./gomokuAi');
const rules = require('./board');

function point(index) {
  return { row: Math.floor(index / 15), col: index % 15, strategy: 'puzzle-defense' };
}

function createTask(board, remaining = 7, options = {}) {
  const state = board.map(row => row.slice());
  const ruleSet = options.ruleSet || 'freestyle';
  const allowThree = Boolean(options.vct);
  const whiteWins = vct.analyzeThreats(state, rules.WHITE, ruleSet, false).wins;
  const blackWins = vct.analyzeThreats(state, rules.BLACK, ruleSet, false).wins;

  let immediate = whiteWins.length ? point(whiteWins[0]) : null;
  // When black threatens a single win in a VCT/renju puzzle, we must still check if white loses or must block.
  if (!immediate && blackWins.length === 1) {
    immediate = point(blackWins[0]);
  }

  let task = immediate
    ? null
    : vct.createTask(state, rules.WHITE, 7, { allowThree: false, ruleSet, maxNodes: 2400 });
  let phase = 'counter';
  let cancelled = false;
  let refuteCandidates = null;
  let refuteIndex = 0;
  let refuteProbe = null;
  let bestSurvival = null;
  let bestSurvivalLen = 0;
  const start = Date.now();

  function prepareRefuteCandidates() {
    const threats = vct.analyzeThreats(state, rules.BLACK, ruleSet, true);
    const seen = new Set();
    const list = [];
    const push = (idx) => {
      if (!seen.has(idx) && state[Math.floor(idx / 15)][idx % 15] === rules.EMPTY) {
        seen.add(idx);
        list.push(idx);
      }
    };
    const heuristic = ai.selectMove(state, rules.WHITE, rules.BLACK, { difficulty: 'normal' });
    threats.fours.forEach(push);
    threats.threes.forEach(push);
    if (heuristic) push(heuristic.row * 15 + heuristic.col);
    return list.slice(0, 10);
  }

  return {
    step(budget = 4) {
      if (cancelled) return { done: true, move: null, cancelled: true };
      if (immediate) return { done: true, move: immediate };

      if (phase !== 'fallback' && Date.now() - start > 550) {
        if (task) task.cancel();
        if (refuteProbe) refuteProbe.cancel();
        task = ai.createMoveTask(state, rules.WHITE, rules.BLACK, { difficulty: 'hard' });
        phase = 'fallback';
      }

      if (phase === 'refute') {
        if (!refuteCandidates) {
          refuteCandidates = prepareRefuteCandidates();
          refuteIndex = 0;
        }
        if (refuteIndex >= refuteCandidates.length) {
          if (bestSurvival !== null) {
            immediate = point(bestSurvival);
            return { done: true, move: immediate };
          }
          phase = 'prevent';
          task = vct.createTask(state, rules.BLACK, Math.max(1, remaining), {
            allowThree,
            ruleSet,
            maxNodes: 2400,
          });
          return { done: false, move: null };
        }

        const idx = refuteCandidates[refuteIndex];
        const r = Math.floor(idx / 15);
        const c = idx % 15;
        if (!refuteProbe) {
          state[r][c] = rules.WHITE;
          refuteProbe = vct.createTask(state, rules.BLACK, Math.max(1, remaining), {
            allowThree,
            ruleSet,
            maxNodes: 1200,
          });
        }
        const probeRes = refuteProbe.step(budget);
        if (!probeRes.done) return { done: false, move: null };

        state[r][c] = rules.EMPTY;
        refuteProbe = null;
        if (!probeRes.proof && !probeRes.limited) {
          immediate = point(idx);
          return { done: true, move: immediate };
        }
        if (probeRes.proof && probeRes.proof.length > bestSurvivalLen) {
          bestSurvivalLen = probeRes.proof.length;
          bestSurvival = idx;
        } else if (bestSurvival === null) {
          bestSurvival = idx;
        }
        refuteIndex += 1;
        return { done: false, move: null };
      }

      const result = task.step(budget);
      if (!result.done) return { done: false, move: null };
      if (phase === 'fallback') return result;
      if (result.proof) {
        immediate = point(result.proof.move);
        return { done: true, move: immediate };
      }

      if (phase === 'counter') {
        if (allowThree || ruleSet === 'renju') {
          phase = 'refute';
        } else {
          phase = 'prevent';
          task = vct.createTask(state, rules.BLACK, Math.max(1, remaining), {
            allowThree: false,
            ruleSet,
            maxNodes: 2400,
          });
        }
      } else if (phase === 'prevent') {
        phase = 'fallback';
        task = ai.createMoveTask(state, rules.WHITE, rules.BLACK, { difficulty: 'hard' });
      }
      return { done: false, move: null };
    },
    cancel() {
      cancelled = true;
      if (task) task.cancel();
      if (refuteProbe) refuteProbe.cancel();
    },
  };
}

function selectMove(board, remaining, options = {}) {
  const task = createTask(board, remaining, options);
  let result;
  do {
    result = task.step(4);
  } while (!result.done);
  return result.move;
}

module.exports = { createTask, selectMove };
