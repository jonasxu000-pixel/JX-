const board = require('../utils/board');
const ai = require('../utils/gomokuAi');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function verifyLegalNeighbourMove() {
  const state = board.createBoard();
  state[7][7] = board.BLACK;
  const before = clone(state);
  const move = ai.selectMove(state);
  assert(move && state[move.row][move.col] === board.EMPTY,
    'AI must choose a legal empty intersection');
  assert(Math.abs(move.row - 7) <= 2 && Math.abs(move.col - 7) <= 2,
    'AI candidates must stay near the active position');
  assert(JSON.stringify(state) === JSON.stringify(before),
    'AI analysis must not mutate the live board');
}

function verifyImmediateWin() {
  const state = board.createBoard();
  [3, 4, 5, 6].forEach(col => { state[7][col] = board.WHITE; });
  state[7][2] = board.BLACK;
  const move = ai.selectMove(state);
  assert(move && move.row === 7 && move.col === 7,
    'AI must complete its own five before considering other patterns');
}

function verifyMandatoryBlock() {
  const state = board.createBoard();
  [4, 5, 6, 7].forEach(col => { state[6][col] = board.BLACK; });
  state[6][3] = board.WHITE;
  const move = ai.selectMove(state);
  assert(move && move.row === 6 && move.col === 8,
    'AI must block the player\'s immediate five');
}

function verifyOpenFourDevelopment() {
  const state = board.createBoard();
  [6, 7, 8].forEach(col => { state[7][col] = board.WHITE; });
  state[6][7] = board.BLACK;
  const move = ai.selectMove(state);
  assert(move && move.row === 7 && [5, 9].includes(move.col),
    'AI must recognize and extend a basic open-three shape');
}

function verifyFullBoard() {
  const state = board.createBoard();
  for (let row = 0; row < board.BOARD_SIZE; row += 1) {
    for (let col = 0; col < board.BOARD_SIZE; col += 1) {
      state[row][col] = (row + col) % 2 ? board.BLACK : board.WHITE;
    }
  }
  assert(ai.isBoardFull(state), 'full-board helper must detect a filled board');
  assert(ai.selectMove(state) === null, 'AI must return no move on a full board');
}

function main() {
  verifyLegalNeighbourMove();
  verifyImmediateWin();
  verifyMandatoryBlock();
  verifyOpenFourDevelopment();
  verifyFullBoard();
  console.log('gomoku AI verification ok');
}

main();
