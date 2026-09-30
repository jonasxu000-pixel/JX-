const rules = require('./board');
const puzzles = require('./puzzles');
const KEY = 'qiyu_unfinished_match_v1';

function load(wxApi) {
  try {
    const match = wxApi && wxApi.getStorageSync && wxApi.getStorageSync(KEY);
    if (!match || match.version !== 1 || !['ai', 'puzzle'].includes(match.mode)
      || !['easy', 'normal', 'hard'].includes(match.difficulty)
      || typeof match.id !== 'string' || !match.id || match.id.length > 128 || ![rules.BLACK, rules.WHITE].includes(match.currentPlayer)
      || !Number.isSafeInteger(match.moves) || match.moves < 0
      || !Array.isArray(match.board) || match.board.length !== rules.BOARD_SIZE
      || !match.board.every(row => Array.isArray(row) && row.length === rules.BOARD_SIZE && row.every(piece => [0, 1, 2].includes(piece)))) return null;
    const puzzle = match.mode === 'puzzle' ? puzzles.getPuzzle(match.puzzleId) : null;
    if (match.mode === 'puzzle' && (!puzzle || match.moves >= puzzle.moves)) return null;
    if (puzzle && (puzzle.black.some(([row, col]) => match.board[row][col] !== rules.BLACK) || puzzle.white.some(([row, col]) => match.board[row][col] !== rules.WHITE))) return null;
    const black = match.board.flat().filter(piece => piece === rules.BLACK).length - (puzzle ? puzzle.black.length : 0);
    const white = match.board.flat().filter(piece => piece === rules.WHITE).length - (puzzle ? puzzle.white.length : 0);
    if (black !== match.moves || white !== black - (match.currentPlayer === rules.WHITE ? 1 : 0)) return null;
    if (match.lastMove && (!rules.isValidPos(match.lastMove.row, match.lastMove.col) || ![1,2].includes(match.lastMove.piece) || match.board[match.lastMove.row][match.lastMove.col] !== match.lastMove.piece)) return null;
    for (let row = 0; row < rules.BOARD_SIZE; row += 1) {
      for (let col = 0; col < rules.BOARD_SIZE; col += 1) {
        if (match.board[row][col] && rules.checkWin(match.board, row, col, match.board[row][col])) return null;
      }
    }
    if (match.board.every(row => row.every(Boolean))) return null;
    return JSON.parse(JSON.stringify(match));
  } catch (_) { return null; }
}

function save(wxApi, match) {
  try {
    if (!wxApi || !wxApi.setStorageSync) return false;
    wxApi.setStorageSync(KEY, { ...match, version: 1 });
    return true;
  } catch (_) { return false; }
}

function clear(wxApi) {
  try { if (wxApi && wxApi.setStorageSync) wxApi.setStorageSync(KEY, null); } catch (_) { /* Non-critical. */ }
}

module.exports = { KEY, load, save, clear };
