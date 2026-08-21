const roomService = require('../services/roomService');

const VIEW_ID = 'a'.repeat(36);
const calls = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function installWxMock() {
  global.wx = {
    cloud: {
      callFunction(options) {
        calls.push({ type: 'callFunction', options });
        if (options.data.action === 'createRoom') {
          return Promise.resolve({
            result: {
              success: true,
              roomId: '123456',
              viewId: VIEW_ID,
              role: 'host',
              color: 'black',
            },
          });
        }
        if (options.data.action === 'joinRoom') {
          return Promise.resolve({
            result: {
              success: true,
              viewId: VIEW_ID,
              role: 'guest',
              color: 'white',
            },
          });
        }
        return Promise.resolve({ result: { success: true } });
      },
      database() {
        return {
          collection(name) {
            calls.push({ type: 'collection', name });
            return {
              doc(id) {
                calls.push({ type: 'doc', name, id });
                return {
                  get() {
                    return Promise.resolve({ data: { status: 'waiting' } });
                  },
                  watch(options) {
                    options.onChange({
                      docs: [{ status: 'waiting' }],
                      docChanges: [{ dataType: 'init' }],
                    });
                    return { close() {} };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

function installDatabaseErrorMock() {
  global.wx = {
    cloud: {
      database() {
        return {
          collection() {
            return {
              doc() {
                return {
                  get() {
                    return Promise.reject(new Error('permission denied for document read'));
                  },
                  watch(options) {
                    options.onError(new Error('request:fail timeout'));
                    return { close() {} };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

async function main() {
  installWxMock();

  const created = await roomService.createRoom({ nickname: '房主' });
  assert(created.roomId === '123456', 'createRoom must keep the shareable room code');
  assert(created.viewId === VIEW_ID, 'createRoom must return the private room view id');

  const joined = await roomService.joinRoom('123456', { nickname: '好友' });
  assert(joined.viewId === VIEW_ID, 'joinRoom must return the same room view id');

  const room = await roomService.getRoom(VIEW_ID);
  assert(room.status === 'waiting', 'getRoom must return the public room view');

  let watched = false;
  roomService.watchRoom(VIEW_ID, data => {
    watched = data.status === 'waiting';
  });
  assert(watched, 'watchRoom must forward public room view changes');

  const collectionCalls = calls.filter(call => call.type === 'collection');
  assert(collectionCalls.length >= 2, 'room reads must access a database collection');
  assert(collectionCalls.every(call => call.name === 'roomViews'),
    'client room reads must never access the private rooms collection');

  let invalidRejected = false;
  try {
    roomService.getRoom('123456');
  } catch (err) {
    invalidRejected = /访问凭证/.test(err.message);
  }
  assert(invalidRejected, 'six digit room ids must not be accepted as database read credentials');

  installDatabaseErrorMock();
  let readError = '';
  try {
    await roomService.getRoom(VIEW_ID);
  } catch (err) {
    readError = err.message;
  }
  assert(readError === '房间服务权限异常，请联系管理员后重试',
    'direct database read errors must be localized');

  let watchError = '';
  roomService.watchRoom(VIEW_ID, () => {}, err => {
    watchError = err.message;
  });
  assert(watchError === '网络连接不稳定，请检查网络后重试',
    'realtime watch errors must be localized');

  console.log('room service privacy verification ok');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
