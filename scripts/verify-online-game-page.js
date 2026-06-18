const path = require('path');
const board = require('../utils/board');

const roomWatchers = new Map();
const roomWatchErrors = new Map();
const modalCalls = [];
const eventOrder = [];
const cloudCalls = [];
let currentRoom = null;
let capturedPageDefinition = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function emitRoom(roomData) {
  currentRoom = clone(roomData);
  const watchers = roomWatchers.get(roomData._id) || [];
  watchers.forEach(onChange => {
    onChange({
      docs: [clone(roomData)],
      docChanges: [{ dataType: 'update' }],
    });
  });
}

function emitWatchError(roomId, error = new Error('network changed')) {
  const handlers = roomWatchErrors.get(roomId) || [];
  handlers.forEach(onError => onError(error));
}

function createEmptyRoom(roomId = '123456') {
  return {
    _id: roomId,
    host: { openId: 'host-openid', color: 'black' },
    guest: { openId: 'guest-openid', color: 'white' },
    status: 'playing',
    currentTurn: 'host',
    winner: null,
    lastMove: null,
    board: board.createBoard(),
  };
}

function createPage(role) {
  const boardComp = {
    lastBoard: null,
    syncBoard(nextBoard, lastMove, currentPiece) {
      eventOrder.push(`${role}:sync`);
      this.lastBoard = clone(nextBoard);
      this.lastMove = clone(lastMove);
      this.currentPiece = currentPiece;
    },
  };

  const page = {
    data: clone(capturedPageDefinition.data),
    setData(nextData) {
      Object.assign(this.data, nextData);
    },
    selectComponent() {
      return boardComp;
    },
  };

  Object.entries(capturedPageDefinition).forEach(([key, value]) => {
    if (key !== 'data') page[key] = value;
  });

  page.onLoad({ roomId: currentRoom._id, role, color: role === 'host' ? 'black' : 'white' });
  page.onReady();
  return { page, boardComp };
}

function installMiniProgramMocks() {
  global.Page = definition => {
    capturedPageDefinition = definition;
  };

  global.wx = {
    cloud: {
      callFunction(options) {
        cloudCalls.push(options.data);
        return Promise.resolve({ result: { success: true } });
      },
      database() {
        return {
          collection() {
            return {
              doc(roomId) {
                return {
                  get() {
                    return Promise.resolve({ data: clone(currentRoom) });
                  },
                  watch({ onChange, onError }) {
                    const watchers = roomWatchers.get(roomId) || [];
                    watchers.push(onChange);
                    roomWatchers.set(roomId, watchers);
                    const errorHandlers = roomWatchErrors.get(roomId) || [];
                    errorHandlers.push(onError);
                    roomWatchErrors.set(roomId, errorHandlers);
                    return {
                      close() {
                        const next = (roomWatchers.get(roomId) || []).filter(item => item !== onChange);
                        roomWatchers.set(roomId, next);
                        const nextErrors = (roomWatchErrors.get(roomId) || []).filter(item => item !== onError);
                        roomWatchErrors.set(roomId, nextErrors);
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
    showModal(options) {
      eventOrder.push(`${options.content}:modal`);
      modalCalls.push(options);
    },
    showToast() {},
    reLaunch(options) {
      eventOrder.push(`${options.url}:reLaunch`);
    },
  };
}

async function verifyWatchSyncAndTurns() {
  currentRoom = createEmptyRoom();
  const host = createPage('host');
  const guest = createPage('guest');
  await flush();

  assert(host.page.data.isMyTurn && !host.page.data.boardLocked, 'host should move first');
  assert(!guest.page.data.isMyTurn && guest.page.data.boardLocked, 'guest should wait for host');

  const afterHostMove = createEmptyRoom();
  afterHostMove.board[7][7] = board.BLACK;
  afterHostMove.lastMove = { row: 7, col: 7, piece: board.BLACK, role: 'host' };
  afterHostMove.currentTurn = 'guest';
  emitRoom(afterHostMove);

  assert(host.boardComp.lastBoard[7][7] === board.BLACK, 'host board should show host move');
  assert(guest.boardComp.lastBoard[7][7] === board.BLACK, 'guest board should receive host move by watch');
  assert(host.page.data.boardLocked, 'host board should lock after host move');
  assert(!guest.page.data.boardLocked, 'guest board should unlock after host move');

  const afterGuestMove = clone(afterHostMove);
  afterGuestMove.board[8][8] = board.WHITE;
  afterGuestMove.lastMove = { row: 8, col: 8, piece: board.WHITE, role: 'guest' };
  afterGuestMove.currentTurn = 'host';
  emitRoom(afterGuestMove);

  assert(host.boardComp.lastBoard[8][8] === board.WHITE, 'host board should receive guest move by watch');
  assert(guest.boardComp.lastBoard[8][8] === board.WHITE, 'guest board should show guest move');
  assert(!host.page.data.boardLocked, 'host board should unlock after guest move');
  assert(guest.page.data.boardLocked, 'guest board should lock after guest move');

  host.page._watcher.close();
  guest.page._watcher.close();
}

async function verifyWatchReconnectAndResume() {
  currentRoom = createEmptyRoom('654321');
  const host = createPage('host');
  await flush();

  assert((roomWatchers.get(currentRoom._id) || []).length === 1, 'host should start one room watcher');
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = callback => {
    setImmediate(callback);
    return 1;
  };
  try {
    emitWatchError(currentRoom._id);
    await flush();
    await flush();
    assert((roomWatchers.get(currentRoom._id) || []).length === 1, 'watch error should replace the failed watcher');
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  host.page.onShow();
  await flush();
  assert((roomWatchers.get(currentRoom._id) || []).length === 1, 'resume should refresh without duplicate watchers');

  if (host.page._watcher) host.page._watcher.close();
}

async function verifyWinnerViewsAndFinalBoardOrder(winner) {
  currentRoom = createEmptyRoom();
  const host = createPage('host');
  const guest = createPage('guest');
  await flush();

  modalCalls.length = 0;
  eventOrder.length = 0;

  const finishedRoom = createEmptyRoom();
  const piece = winner === 'host' ? board.BLACK : board.WHITE;
  const row = winner === 'host' ? 0 : 1;
  for (let col = 0; col < 5; col += 1) finishedRoom.board[row][col] = piece;
  finishedRoom.lastMove = { row, col: 4, piece, role: winner };
  finishedRoom.currentTurn = winner;
  finishedRoom.winner = winner;
  finishedRoom.status = 'finished';
  emitRoom(finishedRoom);

  const expectedHostText = winner === 'host' ? '\u4f60\u83b7\u80dc' : '\u5bf9\u624b\u83b7\u80dc';
  const expectedGuestText = winner === 'guest' ? '\u4f60\u83b7\u80dc' : '\u5bf9\u624b\u83b7\u80dc';
  assert(host.page.data.resultText === expectedHostText, `host result text mismatch for ${winner} win`);
  assert(guest.page.data.resultText === expectedGuestText, `guest result text mismatch for ${winner} win`);
  assert(modalCalls.some(call => call.content === expectedHostText), `host modal missing for ${winner} win`);
  assert(modalCalls.some(call => call.content === expectedGuestText), `guest modal missing for ${winner} win`);
  assert(host.boardComp.lastBoard[row][4] === piece, `host final board missing ${winner} winning move`);
  assert(guest.boardComp.lastBoard[row][4] === piece, `guest final board missing ${winner} winning move`);

  const hostModalIndex = eventOrder.indexOf(`${expectedHostText}:modal`);
  const guestModalIndex = eventOrder.indexOf(`${expectedGuestText}:modal`);
  const hostSyncIndex = eventOrder.indexOf('host:sync');
  const guestSyncIndex = eventOrder.indexOf('guest:sync');
  assert(hostSyncIndex >= 0 && hostSyncIndex < hostModalIndex, 'host final board should sync before host result modal');
  assert(guestSyncIndex >= 0 && guestSyncIndex < guestModalIndex, 'guest final board should sync before guest result modal');

  host.page._watcher.close();
  guest.page._watcher.close();
}

async function verifyOnlineEndActions() {
  currentRoom = createEmptyRoom();
  const host = createPage('host');
  await flush();

  const finishedRoom = createEmptyRoom();
  for (let col = 0; col < 5; col += 1) finishedRoom.board[0][col] = board.BLACK;
  finishedRoom.lastMove = { row: 0, col: 4, piece: board.BLACK, role: 'host' };
  finishedRoom.currentTurn = 'host';
  finishedRoom.winner = 'host';
  finishedRoom.status = 'finished';
  emitRoom(finishedRoom);

  cloudCalls.length = 0;
  host.page._onRestartOnline();
  await flush();
  assert(cloudCalls.some(call => call.action === 'restartRoom' && call.roomId === currentRoom._id), 'online restart should call restartRoom');

  host.page._onExitOnline();
  await flush();
  assert(cloudCalls.some(call => call.action === 'leaveRoom' && call.roomId === currentRoom._id), 'online exit should leave room');
  assert(eventOrder.includes('/pages/index/index:reLaunch'), 'online exit should return to index');

  if (host.page._watcher) host.page._watcher.close();
}

async function main() {
  installMiniProgramMocks();
  const gamePath = path.resolve(__dirname, '../pages/game/game.js');
  delete require.cache[gamePath];
  require(gamePath);

  await verifyWatchSyncAndTurns();
  await verifyWatchReconnectAndResume();
  await verifyWinnerViewsAndFinalBoardOrder('host');
  await verifyWinnerViewsAndFinalBoardOrder('guest');
  await verifyOnlineEndActions();

  console.log('online game page verification ok');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
