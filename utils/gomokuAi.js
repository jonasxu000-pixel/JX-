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

function selectMove(board, aiPiece = boardRules.WHITE, humanPiece = getOpponent(aiPiece)) {
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
  return ranked[0] || null;
}

module.exports = {
  WIN_SCORE,
  collectCandidates,
  evaluateMove,
  isBoardFull,
  isWinningMove,
  selectMove,
};
