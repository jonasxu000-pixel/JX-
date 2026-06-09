const Module = require('module');
const path = require('path');

const rooms = new Map();
let currentOpenId = '';
let transactionQueue = Promise.resolve();
let transactionConflictsRemaining = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unwrap(value) {
  return value && value.__set ? value.value : value;
}

function matchWhere(room, where) {
  return Object.entries(where).every(([key, value]) => room[key] === value);
}

const db = {
  command: {
    set(value) {
      return { __set: true, value };
    },
  },
  serverDate() {
    return new Date('2026-06-08T00:00:00.000Z');
  },
  runTransaction(updateFunction) {
    const transactionRun = transactionQueue.then(async () => {
      if (transactionConflictsRemaining > 0) {
        transactionConflictsRemaining -= 1;
        const err = new Error('database request failed [ResourceUnavailable.TransactionConflict]');
        err.errCode = -501001;
        throw err;
      }

      const transaction = {
        collection(name) {
          return db.collection(name);
        },
      };
      return updateFunction(transaction);
    });

    transactionQueue = transactionRun.catch(() => {});
    return transactionRun;
  },
  collection(name) {
    if (name !== 'rooms') throw new Error(`unexpected collection: ${name}`);

    return {
      add({ data }) {
        rooms.set(data._id, clone(data));
        return Promise.resolve({ _id: data._id });
      },
      doc(id) {
        return {
          get() {
            if (!rooms.has(id)) return Promise.reject(new Error('document not found'));
            return Promise.resolve({ data: clone(rooms.get(id)) });
          },
          update({ data }) {
            if (!rooms.has(id)) return Promise.reject(new Error('document not found'));
            const current = rooms.get(id);
            Object.entries(data).forEach(([key, value]) => {
              current[key] = clone(unwrap(value));
            });
            rooms.set(id, current);
            return Promise.resolve({ stats: { updated: 1 } });
          },
          remove() {
            rooms.delete(id);
            return Promise.resolve({ stats: { removed: 1 } });
          },
        };
      },
      where(where) {
        return {
          update({ data }) {
            let updated = 0;
            rooms.forEach((room, id) => {
              if (updated > 0 || !matchWhere(room, where)) return;
              const next = clone(room);
              Object.entries(data).forEach(([key, value]) => {
                next[key] = clone(unwrap(value));
              });
              rooms.set(id, next);
              updated += 1;
            });
            return Promise.resolve({ stats: { updated } });
          },
        };
      },
    };
  },
};

const wxServerSdkMock = {
  DYNAMIC_CURRENT_ENV: 'local-test',
  init() {},
  database() {
    return db;
  },
  getWXContext() {
    return { OPENID: currentOpenId };
  },
};

const originalRequire = Module.prototype.require;
function installMocks() {
  Module.prototype.require = function patchedRequire(request) {
    if (request === 'wx-server-sdk') return wxServerSdkMock;
    return originalRequire.apply(this, arguments);
  };
}

function restoreMocks() {
  Module.prototype.require = originalRequire;
}

function loadRoomAction() {
  const target = path.resolve(__dirname, '../cloudfunctions/roomAction/index.js');
  delete require.cache[target];
  return require(target);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(roomAction, openId, event) {
  currentOpenId = openId;
  const result = await roomAction.main(event);
  if (!result.success) throw new Error(result.error || 'call failed');
  return result;
}

async function expectFail(roomAction, openId, event, label) {
  currentOpenId = openId;
  const result = await roomAction.main(event);
  assert(!result.success, `${label} should fail`);
  return result;
}

async function createPlayingRoom(roomAction) {
  const created = await call(roomAction, 'host-openid', { action: 'createRoom' });
  const roomId = created.roomId;
  assert(roomId, 'createRoom should return roomId');
  assert(/^\d{6}$/.test(roomId), 'roomId should be a 6 digit code');
  assert(created.role === 'host', 'createRoom should return host role');
  assert(created.color === 'black', 'createRoom should return black color');

  const joined = await call(roomAction, 'guest-openid', { action: 'joinRoom', roomId });
  assert(joined.role === 'guest', 'joinRoom should return guest role');
  assert(joined.color === 'white', 'joinRoom should return white color');
  return roomId;
}

async function verifyHostBlackWin(roomAction) {
  const roomId = await createPlayingRoom(roomAction);

  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 0 });
  await expectFail(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 1 }, 'host double move');
  await expectFail(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 0, col: 0 }, 'occupied move');

  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 0 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 1 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 1 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 2 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 2 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 3 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 3 });
  const win = await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 4 });

  assert(win.status === 'finished', 'host win should finish the game');
  assert(win.winner === 'host', 'host should be winner');
  assert(win.board[0].slice(0, 5).every(piece => piece === 1), 'host black line missing');
  await expectFail(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 4 }, 'move after finished');
}

async function verifyGuestWhiteWin(roomAction) {
  const roomId = await createPlayingRoom(roomAction);

  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 0 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 2, col: 0 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 1 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 2, col: 1 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 2 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 2, col: 2 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 3 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 2, col: 3 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 3, col: 3 });
  const win = await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 2, col: 4 });

  assert(win.status === 'finished', 'guest win should finish the game');
  assert(win.winner === 'guest', 'guest should be winner');
  assert(win.board[2].slice(0, 5).every(piece => piece === 2), 'guest white line missing');
}

async function verifyConcurrentMoveIsAtomic(roomAction) {
  const roomId = await createPlayingRoom(roomAction);

  currentOpenId = 'host-openid';
  const results = await Promise.all([
    roomAction.main({ action: 'placePiece', roomId, row: 4, col: 4 }),
    roomAction.main({ action: 'placePiece', roomId, row: 4, col: 5 }),
  ]);

  const succeeded = results.filter(result => result.success);
  const rejected = results.filter(result => !result.success);
  const room = rooms.get(roomId);
  const savedPieces = room.board[4].slice(4, 6).filter(piece => piece === 1);

  assert(succeeded.length === 1, 'concurrent same-turn moves should only succeed once');
  assert(rejected.length === 1, 'concurrent same-turn moves should reject one request');
  assert(savedPieces.length === 1, 'concurrent same-turn moves should save exactly one black piece');
  assert(room.currentTurn === 'guest', 'concurrent move should switch turn exactly once');
}

async function verifyTransactionConflictRetries(roomAction) {
  const roomId = await createPlayingRoom(roomAction);
  transactionConflictsRemaining = 1;

  const result = await call(roomAction, 'host-openid', {
    action: 'placePiece',
    roomId,
    row: 5,
    col: 5,
  });

  assert(result.lastMove.row === 5 && result.lastMove.col === 5, 'transaction conflict retry should save move');
}

async function verifyConcurrentJoinIsAtomic(roomAction) {
  const created = await call(roomAction, 'host-openid', { action: 'createRoom' });

  currentOpenId = 'guest-a-openid';
  const firstJoin = roomAction.main({ action: 'joinRoom', roomId: created.roomId });
  currentOpenId = 'guest-b-openid';
  const secondJoin = roomAction.main({ action: 'joinRoom', roomId: created.roomId });
  const results = await Promise.all([firstJoin, secondJoin]);

  const succeeded = results.filter(result => result.success);
  const rejected = results.filter(result => !result.success);
  const room = rooms.get(created.roomId);

  assert(succeeded.length === 1, 'concurrent joins should only succeed once');
  assert(rejected.length === 1, 'concurrent joins should reject one guest');
  assert(room.status === 'playing', 'concurrent join should start the game once');
  assert(['guest-a-openid', 'guest-b-openid'].includes(room.guest.openId), 'concurrent join should save one guest');
}

async function verifySelfTestMove(roomAction) {
  const result = await call(roomAction, 'host-openid', { action: 'selfTestMove' });
  assert(result.version, 'self test should return version');
  assert(result.piece === 1, 'self test should write a black piece');
  assert(result.currentTurn === 'guest', 'self test should switch turn to guest');
  assert(result.lastMove && result.lastMove.row === 7 && result.lastMove.col === 7, 'self test lastMove mismatch');
}

async function verifySelfTestMatch(roomAction) {
  const result = await call(roomAction, 'host-openid', { action: 'selfTestMatch' });
  assert(result.version, 'match self test should return version');
  assert(result.moves === 9, 'match self test should apply 9 moves');
  assert(result.rejectedGuestEarlyMove, 'match self test should reject guest early move');
  assert(result.hostBlackLine, 'match self test should confirm host black line');
  assert(result.guestWhiteLine, 'match self test should confirm guest white moves');
  assert(result.status === 'finished', 'match self test should finish game');
  assert(result.winner === 'host', 'match self test should produce host winner');
  assert(result.lastMove && result.lastMove.piece === 1, 'match self test last move should be black');
}

async function verifySelfTestConcurrentMove(roomAction) {
  const result = await call(roomAction, 'host-openid', { action: 'selfTestConcurrentMove' });
  assert(result.version, 'concurrent self test should return version');
  assert(result.succeeded === 1, 'concurrent self test should succeed exactly once');
  assert(result.rejected === 1, 'concurrent self test should reject exactly once');
  assert(result.savedBlackPieces === 1, 'concurrent self test should save exactly one black piece');
  assert(result.currentTurn === 'guest', 'concurrent self test should switch turn exactly once');
}

async function verifySelfTestWatchRoom(roomAction) {
  const created = await call(roomAction, 'host-openid', {
    action: 'selfTestWatchRoom',
    mode: 'create',
  });
  assert(created.roomId.startsWith('TEST_WATCH_'), 'watch self test should create a temporary room');

  const moved = await call(roomAction, 'host-openid', {
    action: 'selfTestWatchRoom',
    mode: 'move',
    roomId: created.roomId,
  });
  assert(moved.lastMove.row === 7 && moved.lastMove.col === 7, 'watch self test should save center move');
  assert(moved.lastMove.piece === 1, 'watch self test should save black piece');

  const cleaned = await call(roomAction, 'host-openid', {
    action: 'selfTestWatchRoom',
    mode: 'cleanup',
    roomId: created.roomId,
  });
  assert(cleaned.cleaned, 'watch self test should clean temporary room');
}

async function verifySelfTestJoinRoom(roomAction) {
  const result = await call(roomAction, 'host-openid', { action: 'selfTestJoinRoom' });
  assert(/^\d{6}$/.test(result.roomId), 'join self test should use a 6 digit room code');
  assert(result.role === 'guest', 'join self test should return guest role');
  assert(result.color === 'white', 'join self test should return white color');
  assert(result.status === 'playing', 'join self test should start the game');
  assert(result.guestColor === 'white', 'join self test should save guest white color');
  assert(result.succeeded === 1, 'join self test should only accept one concurrent guest');
  assert(result.rejected === 1, 'join self test should reject one concurrent guest');
}

async function main() {
  installMocks();
  const roomAction = loadRoomAction();

  await verifyHostBlackWin(roomAction);
  await verifyGuestWhiteWin(roomAction);
  await verifyConcurrentMoveIsAtomic(roomAction);
  await verifyTransactionConflictRetries(roomAction);
  await verifyConcurrentJoinIsAtomic(roomAction);
  await verifySelfTestMove(roomAction);
  await verifySelfTestMatch(roomAction);
  await verifySelfTestConcurrentMove(roomAction);
  await verifySelfTestWatchRoom(roomAction);
  await verifySelfTestJoinRoom(roomAction);

  console.log('roomAction verification ok');
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(restoreMocks);
