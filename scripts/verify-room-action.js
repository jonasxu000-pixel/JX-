const Module = require('module');
const path = require('path');

const rooms = new Map();
let currentOpenId = '';
let nextRoomId = '123456';

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
const originalRandom = Math.random;

function installMocks() {
  Module.prototype.require = function patchedRequire(request) {
    if (request === 'wx-server-sdk') return wxServerSdkMock;
    return originalRequire.apply(this, arguments);
  };
  Math.random = () => (Number(nextRoomId) - 100000) / 900000;
}

function restoreMocks() {
  Math.random = originalRandom;
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

async function createPlayingRoom(roomAction, roomId) {
  nextRoomId = roomId;
  const created = await call(roomAction, 'host-openid', { action: 'createRoom' });
  assert(created.roomId === roomId, 'room id mismatch');
  await call(roomAction, 'guest-openid', { action: 'joinRoom', roomId });
  return roomId;
}

async function verifyHostBlackWin(roomAction) {
  const roomId = await createPlayingRoom(roomAction, '123456');

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
  const roomId = await createPlayingRoom(roomAction, '654321');

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

async function main() {
  installMocks();
  const roomAction = loadRoomAction();

  await verifyHostBlackWin(roomAction);
  await verifyGuestWhiteWin(roomAction);

  console.log('roomAction verification ok');
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(restoreMocks);
