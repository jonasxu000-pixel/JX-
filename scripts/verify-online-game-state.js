const board = require('../utils/board');
const { deriveOnlineGameState, pieceToRole, roleToPiece } = require('../utils/onlineGameState');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertState(actual, expected, label) {
  Object.entries(expected).forEach(([key, value]) => {
    assert(actual[key] === value, `${label}: ${key} expected ${value}, got ${actual[key]}`);
  });
}

function verifyPlayingTurns() {
  const hostTurnRoom = {
    status: 'playing',
    currentTurn: 'host',
    winner: null,
  };

  assertState(deriveOnlineGameState(hostTurnRoom, 'host'), {
    currentPlayer: board.BLACK,
    isMyTurn: true,
    boardLocked: false,
    gameOver: false,
    resultText: '',
    shouldShowResult: false,
  }, 'host own turn');

  assertState(deriveOnlineGameState(hostTurnRoom, 'guest'), {
    currentPlayer: board.BLACK,
    isMyTurn: false,
    boardLocked: true,
    gameOver: false,
    resultText: '',
    shouldShowResult: false,
  }, 'guest waits host turn');

  const guestTurnRoom = {
    status: 'playing',
    currentTurn: 'guest',
    winner: null,
  };

  assertState(deriveOnlineGameState(guestTurnRoom, 'guest'), {
    currentPlayer: board.WHITE,
    isMyTurn: true,
    boardLocked: false,
    gameOver: false,
    resultText: '',
    shouldShowResult: false,
  }, 'guest own turn');
}

function verifyResults() {
  const hostWinRoom = {
    status: 'finished',
    currentTurn: 'host',
    winner: 'host',
  };

  assertState(deriveOnlineGameState(hostWinRoom, 'host'), {
    statusText: '\u4f60\u83b7\u80dc',
    resultText: '\u4f60\u83b7\u80dc',
    gameOver: true,
    isMyTurn: false,
    boardLocked: true,
    shouldShowResult: true,
  }, 'host sees own win');

  assertState(deriveOnlineGameState(hostWinRoom, 'guest'), {
    statusText: '\u5bf9\u624b\u83b7\u80dc',
    resultText: '\u5bf9\u624b\u83b7\u80dc',
    gameOver: true,
    isMyTurn: false,
    boardLocked: true,
    shouldShowResult: true,
  }, 'guest sees host win');

  const guestWinRoom = {
    status: 'finished',
    currentTurn: 'guest',
    winner: 'guest',
  };

  assertState(deriveOnlineGameState(guestWinRoom, 'guest'), {
    currentPlayer: board.WHITE,
    statusText: '\u4f60\u83b7\u80dc',
    resultText: '\u4f60\u83b7\u80dc',
    gameOver: true,
    isMyTurn: false,
    boardLocked: true,
    shouldShowResult: true,
  }, 'guest sees own win');
}

function verifyWaitingAndMissingRoom() {
  assertState(deriveOnlineGameState({ status: 'waiting', currentTurn: 'host' }, 'host'), {
    statusText: '\u5bf9\u624b\u5df2\u79bb\u5f00',
    resultText: '\u5bf9\u624b\u5df2\u79bb\u5f00\u623f\u95f4',
    gameOver: true,
    isMyTurn: false,
    boardLocked: true,
    shouldShowResult: false,
  }, 'waiting room');

  assertState(deriveOnlineGameState(null, 'host'), {
    statusText: '\u623f\u95f4\u5df2\u4e0d\u5b58\u5728',
    resultText: '\u623f\u95f4\u5df2\u4e0d\u5b58\u5728',
    gameOver: true,
    isMyTurn: false,
    boardLocked: true,
    shouldShowResult: false,
  }, 'missing room');
}

function verifyRolePieceMapping() {
  assert(roleToPiece('host') === board.BLACK, 'host should be black');
  assert(roleToPiece('guest') === board.WHITE, 'guest should be white');
  assert(pieceToRole(board.BLACK) === 'host', 'black should map to host');
  assert(pieceToRole(board.WHITE) === 'guest', 'white should map to guest');
}

verifyRolePieceMapping();
verifyPlayingTurns();
verifyResults();
verifyWaitingAndMissingRoom();

console.log('online game state verification ok');
