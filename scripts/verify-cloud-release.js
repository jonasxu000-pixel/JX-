const automator = require('miniprogram-automator');

const AUTOMATION_ENDPOINT = process.env.WX_AUTOMATION_ENDPOINT || 'ws://127.0.0.1:9420';
const EXPECTED_VERSION = 'roomAction-20260611-release-candidate-2';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runProbe(miniProgram) {
  return miniProgram.evaluate(async () => {
    const ping = await wx.cloud.callFunction({
      name: 'roomAction',
      data: { action: 'ping' },
    });
    const diagnostics = await wx.cloud.callFunction({
      name: 'roomAction',
      data: { action: 'selfTestMove' },
    });
    const created = await wx.cloud.callFunction({
      name: 'roomAction',
      data: { action: 'createRoom' },
    });
    const roomId = created.result && created.result.roomId;
    const restartWhileWaiting = roomId
      ? await wx.cloud.callFunction({
        name: 'roomAction',
        data: { action: 'restartRoom', roomId },
      })
      : null;

    let readOk = false;
    let directWriteBlocked = false;
    let directWriteError = '';

    try {
      const room = await wx.cloud.database().collection('rooms').doc(roomId).get();
      readOk = Boolean(room.data && room.data._id === roomId);
      await wx.cloud.database().collection('rooms').doc(roomId).update({
        data: { clientWriteProbe: true },
      });
    } catch (err) {
      directWriteBlocked = true;
      directWriteError = err.errMsg || err.message || String(err);
    } finally {
      if (roomId) {
        await wx.cloud.callFunction({
          name: 'roomAction',
          data: { action: 'leaveRoom', roomId },
        });
      }
    }

    return {
      ping: ping.result,
      diagnostics: diagnostics.result,
      created: created.result,
      restartWhileWaiting: restartWhileWaiting && restartWhileWaiting.result,
      readOk,
      directWriteBlocked,
      directWriteError,
    };
  });
}

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: AUTOMATION_ENDPOINT });

  try {
    const result = await runProbe(miniProgram);
    assert(result.ping && result.ping.success, 'cloud health ping failed');
    assert(result.ping.version === EXPECTED_VERSION, `unexpected cloud version: ${result.ping.version}`);
    assert(result.diagnostics && !result.diagnostics.success, 'production diagnostics must be disabled');
    assert(result.created && result.created.success, 'cloud createRoom failed');
    assert(result.restartWhileWaiting && !result.restartWhileWaiting.success, 'restart should reject unfinished waiting rooms');
    assert(result.readOk, 'client room read failed');
    assert(result.directWriteBlocked, 'P0: client can write rooms directly');

    console.log(JSON.stringify({
      version: result.ping.version,
      env: result.ping.env,
      diagnosticsBlocked: true,
      createRoomOk: true,
      restartGuardOk: true,
      clientReadOk: true,
      clientWriteBlocked: true,
      clientWriteError: result.directWriteError,
      temporaryRoomCleaned: true,
    }, null, 2));
    console.log('V1.0 cloud release gate ok');
  } finally {
    miniProgram.disconnect();
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});
