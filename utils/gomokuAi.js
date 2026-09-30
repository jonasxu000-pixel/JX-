const boardRules = require('./board');

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const WIN_SCORE = 100000000;

function getOpponent(piece) {
  return piece === boardRules.BLACK ? boardRules.WHITE : boardRules.BLACK;
}

function isBoardFull(board) {
  return board.every(row => row.every(piece => piece !== boardRules.EMPTY));
}

function isWinningMove(board, row, col, piece) {
  if (!boardRules.isValidPos(row, col) || board[row][col] !== boardRules.EMPTY) return false;
  board[row][col] = piece;
  const won = boardRules.checkWin(board, row, col, piece);
  board[row][col] = boardRules.EMPTY;
  return won;
}

function collectCandidates(board, radius = 2) {
  const candidates = new Map();
  let occupied = 0;

  for (let row = 0; row < boardRules.BOARD_SIZE; row += 1) {
    for (let col = 0; col < boardRules.BOARD_SIZE; col += 1) {
      if (board[row][col] === boardRules.EMPTY) continue;
      occupied += 1;
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          const nextRow = row + dr;
          const nextCol = col + dc;
          if (!boardRules.isValidPos(nextRow, nextCol)) continue;
          if (board[nextRow][nextCol] !== boardRules.EMPTY) continue;
          candidates.set(`${nextRow}:${nextCol}`, { row: nextRow, col: nextCol });
        }
      }
    }
  }

  if (occupied === 0) {
    const center = Math.floor(boardRules.BOARD_SIZE / 2);
    return [{ row: center, col: center }];
  }

  return Array.from(candidates.values());
}

function countSide(board, row, col, piece, dr, dc) {
  let count = 0;
  let nextRow = row + dr;
  let nextCol = col + dc;
  while (boardRules.isValidPos(nextRow, nextCol) && board[nextRow][nextCol] === piece) {
    count += 1;
    nextRow += dr;
    nextCol += dc;
  }
  const open = boardRules.isValidPos(nextRow, nextCol)
    && board[nextRow][nextCol] === boardRules.EMPTY;
  return { count, open };
}

function scoreContiguous(count, openEnds) {
  if (count >= 5) return WIN_SCORE;
  if (count === 4 && openEnds === 2) return 4000000;
  if (count === 4 && openEnds === 1) return 700000;
  if (count === 3 && openEnds === 2) return 180000;
  if (count === 3 && openEnds === 1) return 20000;
  if (count === 2 && openEnds === 2) return 5000;
  if (count === 2 && openEnds === 1) return 600;
  if (count === 1 && openEnds === 2) return 120;
  return 12;
}

function scoreWindows(board, row, col, piece, dr, dc) {
  let score = 0;
  for (let start = -4; start <= 0; start += 1) {
    let own = 0;
    let blocked = false;
    for (let index = 0; index < 5; index += 1) {
      const targetRow = row + (start + index) * dr;
      const targetCol = col + (start + index) * dc;
      if (!boardRules.isValidPos(targetRow, targetCol)) {
        blocked = true;
        break;
      }
      const value = board[targetRow][targetCol];
      if (value === getOpponent(piece)) {
        blocked = true;
        break;
      }
      if (value === piece) own += 1;
    }
    if (blocked) continue;
    if (own === 5) score += WIN_SCORE;
    else if (own === 4) score += 250000;
    else if (own === 3) score += 12000;
    else if (own === 2) score += 600;
    else if (own === 1) score += 30;
  }
  return score;
}

function evaluateMove(board, row, col, piece) {
  if (!boardRules.isValidPos(row, col) || board[row][col] !== boardRules.EMPTY) {
    return { score: -Infinity, forcingDirections: 0 };
  }

  board[row][col] = piece;
  let score = 0;
  let forcingDirections = 0;

  DIRECTIONS.forEach(([dr, dc]) => {
    const forward = countSide(board, row, col, piece, dr, dc);
    const backward = countSide(board, row, col, piece, -dr, -dc);
    const count = 1 + forward.count + backward.count;
    const openEnds = Number(forward.open) + Number(backward.open);
    const directionScore = scoreContiguous(count, openEnds)
      + scoreWindows(board, row, col, piece, dr, dc);
    score += directionScore;
    if ((count >= 4 && openEnds > 0) || (count === 3 && openEnds === 2)) {
      forcingDirections += 1;
    }
  });

  board[row][col] = boardRules.EMPTY;
  if (forcingDirections >= 2) score += 1200000;
  return { score, forcingDirections };
}

function centerPreference(row, col) {
  const center = (boardRules.BOARD_SIZE - 1) / 2;
  return 80 - (Math.abs(row - center) + Math.abs(col - center)) * 4;
}

function compareMoves(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  const center = (boardRules.BOARD_SIZE - 1) / 2;
  const leftDistance = Math.abs(left.row - center) + Math.abs(left.col - center);
  const rightDistance = Math.abs(right.row - center) + Math.abs(right.col - center);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  if (left.row !== right.row) return left.row - right.row;
  return left.col - right.col;
}

function selectMove(board, aiPiece = boardRules.WHITE, humanPiece = getOpponent(aiPiece), options = {}) {
  if (!Array.isArray(board) || isBoardFull(board)) return null;
  const candidates = collectCandidates(board);
  if (!candidates.length) return null;

  const winningMoves = candidates.filter(move => (
    isWinningMove(board, move.row, move.col, aiPiece)
  ));
  if (winningMoves.length) {
    return winningMoves
      .map(move => ({ ...move, score: WIN_SCORE + centerPreference(move.row, move.col) }))
      .sort(compareMoves)[0];
  }

  const mustBlock = new Set(
    candidates
      .filter(move => isWinningMove(board, move.row, move.col, humanPiece))
      .map(move => `${move.row}:${move.col}`),
  );
  const pool = mustBlock.size
    ? candidates.filter(move => mustBlock.has(`${move.row}:${move.col}`))
    : candidates;

  const ranked = pool.map(move => {
    const attack = evaluateMove(board, move.row, move.col, aiPiece);
    const defense = evaluateMove(board, move.row, move.col, humanPiece);
    return {
      ...move,
      score: attack.score * 1.08
        + defense.score * 1.16
        + centerPreference(move.row, move.col)
        + (mustBlock.size ? 50000000 : 0),
    };
  });

  ranked.sort(compareMoves);
  if (options.difficulty === 'easy' && !mustBlock.size) {
    const safe = ranked.filter(move => move.score >= ranked[0].score * 0.55).slice(0, 5);
    const random = typeof options.random === 'function' ? options.random() : Math.random();
    return safe[Math.min(safe.length - 1, Math.max(0, Math.floor(random * safe.length)))];
  }
  return ranked[0] || null;
}

// A cancellable, sliced search. Each yield leaves the private board intact.
// Hard mode examines the opponent's replies; it is deliberately bounded for phones.
function* analyze(state, aiPiece, humanPiece, difficulty, random) {
  const candidates = collectCandidates(state);
  const ranked = [];
  const wins = [];
  const blocks = [];
  for (const move of candidates) {
    if (isWinningMove(state, move.row, move.col, aiPiece)) wins.push(move);
    if (isWinningMove(state, move.row, move.col, humanPiece)) blocks.push(move);
    const attack = evaluateMove(state, move.row, move.col, aiPiece);
    const defense = evaluateMove(state, move.row, move.col, humanPiece);
    ranked.push({ ...move, score: attack.score * 1.08 + defense.score * 1.16 + centerPreference(move.row, move.col) });
    yield null;
  }
  ranked.sort(compareMoves);
  if (wins.length) return { ...wins.sort((a, b) => centerPreference(b.row, b.col) - centerPreference(a.row, a.col))[0], strategy: 'win' };
  if (blocks.length) {
    const move = ranked.find(item => blocks.some(block => block.row === item.row && block.col === item.col));
    return { ...move, strategy: 'block' };
  }
  if (!ranked.length) return null;
  if (difficulty === 'easy') {
    const pool = ranked.filter(move => move.score >= ranked[0].score * 0.55).slice(0, 5);
    return { ...pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))], strategy: 'relaxed' };
  }
  if (difficulty !== 'hard') return { ...ranked[0], strategy: 'heuristic' };
  const tested = [];
  for (const move of ranked.slice(0, 8)) {
    state[move.row][move.col] = aiPiece;
    const replies = [];
    let winningNext = 0;
    for (const reply of collectCandidates(state)) {
      if (isWinningMove(state, reply.row, reply.col, aiPiece)) winningNext += 1;
      const opponentWins = isWinningMove(state, reply.row, reply.col, humanPiece);
      const attack = evaluateMove(state, reply.row, reply.col, humanPiece);
      const defense = evaluateMove(state, reply.row, reply.col, aiPiece);
      replies.push({ ...reply, score: opponentWins ? WIN_SCORE : attack.score + defense.score * 0.9, opponentWins });
      yield null;
    }
    replies.sort(compareMoves);
    let worst = 0;
    for (const reply of replies.slice(0, 6)) {
      if (reply.opponentWins) { worst = WIN_SCORE; break; }
      state[reply.row][reply.col] = humanPiece;
      let followup = 0;
      for (const next of collectCandidates(state)) {
        followup = Math.max(followup, evaluateMove(state, next.row, next.col, aiPiece).score);
        yield null;
      }
      state[reply.row][reply.col] = boardRules.EMPTY;
      worst = Math.max(worst, reply.score - followup * 0.55);
    }
    state[move.row][move.col] = boardRules.EMPTY;
    tested.push({ ...move, score: winningNext >= 2 && !replies.some(reply => reply.opponentWins) ? WIN_SCORE / 2 : move.score * 0.65 - worst, strategy: 'reply-search' });
    tested.sort(compareMoves);
    yield { best: tested[0] };
  }
  return tested[0] || { ...ranked[0], strategy: 'heuristic' };
}

function createMoveTask(board, aiPiece = boardRules.WHITE, humanPiece = getOpponent(aiPiece), options = {}) {
  const state = board.map(row => row.slice());
  const difficulty = ['easy', 'normal', 'hard'].includes(options.difficulty) ? options.difficulty : 'normal';
  const generator = analyze(state, aiPiece, humanPiece, difficulty, options.random || Math.random);
  let cancelled = false;
  let done = isBoardFull(state);
  let best = null;
  let completedCandidates = 0;
  let startedAt = null;
  return {
    cancel() { cancelled = true; generator.return(); },
    step(sliceMs = 4) {
      if (cancelled || done) return { done: true, move: cancelled ? null : best, cancelled };
      const now = Date.now();
      if (startedAt === null) startedAt = now;
      let iterations = 0;
      do {
        const result = generator.next();
        if (result.done) { done = true; best = result.value; break; }
        if (result.value && result.value.best) { best = result.value.best; completedCandidates += 1; }
        iterations += 1;
      } while (iterations < 80 && Date.now() - now < sliceMs);
      // Stop only after a complete candidate has been evaluated.
      if (difficulty === 'hard' && best && completedCandidates >= 3 && Date.now() - startedAt >= 220) { done = true; generator.return(); }
      return { done, move: done ? best : null, cancelled: false };
    },
  };
}

module.exports = {
  WIN_SCORE,
  collectCandidates,
  evaluateMove,
  isBoardFull,
  isWinningMove,
  selectMove,
  createMoveTask,
};
