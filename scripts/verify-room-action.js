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
  const created = await call(roomAction, 'host-openid', {
    action: 'createRoom',
    playerProfile: {
      nickname: '黑棋小徐',
      avatarUrl: 'https://example.com/host-avatar.png',
    },
  });
  const roomId = created.roomId;
  assert(roomId, 'createRoom should return roomId');
  assert(/^\d{6}$/.test(roomId), 'roomId should be a 6 digit code');
  assert(created.role === 'host', 'createRoom should return host role');
  assert(created.color === 'black', 'createRoom should return black color');

  const joined = await call(roomAction, 'guest-openid', {
    action: 'joinRoom',
    roomId,
    playerProfile: {
      nickname: '白棋好友',
      avatarUrl: 'https://example.com/guest-avatar.png',
    },
  });
  assert(joined.role === 'guest', 'joinRoom should return guest role');
  assert(joined.color === 'white', 'joinRoom should return white color');
  const room = rooms.get(roomId);
  assert(room.host.nickname === '黑棋小徐', 'room must store the host display nickname');
  assert(room.host.avatarUrl.includes('host-avatar.png'), 'room must store the host display avatar');
  assert(room.guest.nickname === '白棋好友', 'room must store the guest display nickname');
  assert(room.guest.avatarUrl.includes('guest-avatar.png'), 'room must store the guest display avatar');
  return roomId;
}

async function verifyPlayerProfileSanitization(roomAction) {
  const created = await call(roomAction, 'profile-host-openid', {
    action: 'createRoom',
    playerProfile: {
      nickname: '  超长昵称一二三四五六七八九十  ',
      avatarUrl: 'javascript:alert(1)',
    },
  });
  const room = rooms.get(created.roomId);
  assert(room.host.nickname.length <= 12, 'cloud profile nickname must be length limited');
  assert(room.host.avatarUrl === '', 'cloud profile avatar must only accept HTTPS URLs');
  await call(roomAction, 'profile-host-openid', {
    action: 'leaveRoom',
    roomId: created.roomId,
  });
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

async function verifyFullBoardDraw(roomAction) {
  const roomId = 'draw-room';
  const drawBoard = Array.from({ length: 15 }, (_, row) => (
    Array.from({ length: 15 }, (_, col) => ((row + 2 * col) % 4 < 2 ? 1 : 2))
  ));
  drawBoard[14][13] = 0;

  rooms.set(roomId, {
    _id: roomId,
    host: { openId: 'host-openid', color: 'black' },
    guest: { openId: 'guest-openid', color: 'white' },
    currentTurn: 'host',
    board: drawBoard,
    lastMove: null,
    winner: null,
    status: 'playing',
  });

  const result = await call(roomAction, 'host-openid', {
    action: 'placePiece',
    roomId,
    row: 14,
    col: 13,
  });

  assert(result.status === 'finished', 'full board draw should finish the game');
  assert(result.winner === null, 'full board draw should not have a winner');
}

async function verifyRestartRoom(roomAction) {
  const roomId = await createPlayingRoom(roomAction);

  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 0 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 0 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 1 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 1 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 2 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 2 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 3 });
  await call(roomAction, 'guest-openid', { action: 'placePiece', roomId, row: 1, col: 3 });
  await call(roomAction, 'host-openid', { action: 'placePiece', roomId, row: 0, col: 4 });

  const guestReady = await call(roomAction, 'guest-openid', { action: 'restartRoom', roomId });
  assert(guestReady.status === 'finished', 'one restart confirmation must keep the finished board');
  assert(!guestReady.restarted, 'one restart confirmation must not restart the room');
  assert(guestReady.restartReady.guest, 'guest restart confirmation must be recorded');
  assert(!guestReady.restartReady.host, 'host must still confirm the restart');
  const finishedRoom = rooms.get(roomId);
  assert(finishedRoom.board[0][4] === 1, 'one restart confirmation must preserve the finished board');
  await expectFail(roomAction, 'host-openid', {
    action: 'placePiece',
    roomId,
    row: 2,
    col: 2,
  }, 'move while waiting for restart consent');

  const restarted = await call(roomAction, 'host-openid', { action: 'restartRoom', roomId });
  assert(restarted.restarted, 'second restart confirmation should restart the room');
  assert(restarted.status === 'playing', 'restart should put room back into playing state');
  assert(restarted.currentTurn === 'host', 'restart should let host black move first');
  assert(restarted.winner === null, 'restart should clear winner');
  assert(restarted.board.every(row => row.every(piece => piece === 0)), 'restart should clear board');

  await expectFail(roomAction, 'outsider-openid', { action: 'restartRoom', roomId }, 'outsider restart');
  await expectFail(roomAction, 'host-openid', { action: 'restartRoom', roomId }, 'restart while playing');
}

async function verifyLeaveLocksOpponent(roomAction) {
  const guestLeaveRoomId = await createPlayingRoom(roomAction);
  await call(roomAction, 'guest-openid', { action: 'leaveRoom', roomId: guestLeaveRoomId });
  const waitingRoom = rooms.get(guestLeaveRoomId);
  assert(waitingRoom.status === 'waiting', 'guest leave must return room to waiting');
  assert(waitingRoom.guest === null, 'guest leave must clear the guest identity');
  assert(!waitingRoom.restartReady.host && !waitingRoom.restartReady.guest, 'guest leave must clear restart consent');
  await expectFail(roomAction, 'host-openid', {
    action: 'placePiece',
    roomId: guestLeaveRoomId,
    row: 7,
    col: 7,
  }, 'host move after guest leave');

  const hostLeaveRoomId = await createPlayingRoom(roomAction);
  await call(roomAction, 'host-openid', { action: 'leaveRoom', roomId: hostLeaveRoomId });
  assert(!rooms.has(hostLeaveRoomId), 'host leave must close the room');
}

async function verifySurrender(roomAction) {
  const guestSurrenderRoomId = await createPlayingRoom(roomAction);
  const surrendered = await call(roomAction, 'guest-openid', {
    action: 'surrenderRoom',
    roomId: guestSurrenderRoomId,
  });
  const finishedRoom = rooms.get(guestSurrenderRoomId);

  assert(surrendered.status === 'finished', 'surrender must finish the current round');
  assert(surrendered.winner === 'host', 'guest surrender must award the host victory');
  assert(finishedRoom.finishReason === 'surrender', 'room must record the surrender finish reason');
  assert(finishedRoom.surrenderedBy === 'guest', 'room must record the surrendering role');
  assert(!finishedRoom.restartReady.host && !finishedRoom.restartReady.guest, 'surrender must clear rematch readiness');
  await expectFail(roomAction, 'guest-openid', {
    action: 'placePiece',
    roomId: guestSurrenderRoomId,
    row: 7,
    col: 7,
  }, 'move after surrender');
  await expectFail(roomAction, 'guest-openid', {
    action: 'surrenderRoom',
    roomId: guestSurrenderRoomId,
  }, 'repeat surrender');

  await call(roomAction, 'host-openid', { action: 'restartRoom', roomId: guestSurrenderRoomId });
  await call(roomAction, 'guest-openid', { action: 'restartRoom', roomId: guestSurrenderRoomId });
  const restartedRoom = rooms.get(guestSurrenderRoomId);
  assert(restartedRoom.status === 'playing', 'both players may rematch after surrender');
  assert(restartedRoom.finishReason === null, 'rematch must clear surrender finish reason');
  assert(restartedRoom.surrenderedBy === null, 'rematch must clear surrendering role');

  const hostSurrenderRoomId = await createPlayingRoom(roomAction);
  const hostSurrendered = await call(roomAction, 'host-openid', {
    action: 'surrenderRoom',
    roomId: hostSurrenderRoomId,
  });
  assert(hostSurrendered.winner === 'guest', 'host surrender must award the guest victory');

  const outsiderRoomId = await createPlayingRoom(roomAction);
  await expectFail(roomAction, 'outsider-openid', {
    action: 'surrenderRoom',
    roomId: outsiderRoomId,
  }, 'outsider surrender');
}

async function verifyConcurrentRestartConsent(roomAction) {
  const roomId = await createPlayingRoom(roomAction);
  const finishedRoom = rooms.get(roomId);
  finishedRoom.status = 'finished';
  finishedRoom.winner = 'host';
  finishedRoom.board[0][0] = 1;
  finishedRoom.restartReady = { host: false, guest: false };
  rooms.set(roomId, finishedRoom);

  currentOpenId = 'host-openid';
  const hostReady = roomAction.main({ action: 'restartRoom', roomId });
  currentOpenId = 'guest-openid';
  const guestReady = roomAction.main({ action: 'restartRoom', roomId });
  const results = await Promise.all([hostReady, guestReady]);
  const restarted = results.filter(result => result.success && result.restarted);
  const waiting = results.filter(result => result.success && !result.restarted);
  const savedRoom = rooms.get(roomId);

  assert(restarted.length === 1, 'concurrent restart consent must restart exactly once');
  assert(waiting.length === 1, 'first concurrent restart consent must wait for the opponent');
  assert(savedRoom.status === 'playing', 'both concurrent confirmations must start the new round');
  assert(savedRoom.board.every(row => row.every(piece => piece === 0)), 'concurrent restart must clear the board once');
  assert(!savedRoom.restartReady.host && !savedRoom.restartReady.guest, 'new round must clear both restart confirmations');
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

async function verifyDiagnosticsDisabledByDefault(roomAction) {
  delete process.env.ENABLE_ROOM_DIAGNOSTICS;
  await expectFail(roomAction, 'host-openid', { action: 'selfTestMove' }, 'production diagnostics');
}

async function verifyHealthPing(roomAction) {
  delete process.env.ENABLE_ROOM_DIAGNOSTICS;
  const result = await call(roomAction, 'host-openid', { action: 'ping' });
  assert(result.version === 'roomAction-20260728-versus-profile-ui-5', 'health ping should expose deployed version');
}

async function main() {
  installMocks();
  const roomAction = loadRoomAction();

  await verifyHostBlackWin(roomAction);
  await verifyGuestWhiteWin(roomAction);
  await verifyFullBoardDraw(roomAction);
  await verifyRestartRoom(roomAction);
  await verifyConcurrentRestartConsent(roomAction);
  await verifyLeaveLocksOpponent(roomAction);
  await verifySurrender(roomAction);
  await verifyPlayerProfileSanitization(roomAction);
  await verifyConcurrentMoveIsAtomic(roomAction);
  await verifyTransactionConflictRetries(roomAction);
  await verifyConcurrentJoinIsAtomic(roomAction);
  await verifyDiagnosticsDisabledByDefault(roomAction);
  await verifyHealthPing(roomAction);
  process.env.ENABLE_ROOM_DIAGNOSTICS = 'true';
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
  .finally(() => {
    delete process.env.ENABLE_ROOM_DIAGNOSTICS;
    restoreMocks();
  });
