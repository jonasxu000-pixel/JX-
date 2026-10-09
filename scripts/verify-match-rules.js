const assert = require('assert/strict');
const { createTestRuntime } = require('./practice-test-support');
const store = require('../utils/localMatchStore');
const progress = require('../utils/progressStore');
function tapBoard(scene, r, c) {
  const p = scene.boardRect.width * 0.08;
  const cell = (scene.boardRect.width - p * 2) / 14;
  scene.handleTouch(scene.boardRect.x + p + c * cell, scene.boardRect.y + p + r * cell);
}
async function run() {
  const oldNow = Date.now;
  let now = oldNow();
  Date.now = () => now;
  try {
    const { runtime, wx } = createTestRuntime();
    const manager = runtime.manager;
    manager.go('aiGame', { rules: { turnSeconds: 30, allowUndo: true, undoLimit: 2 } });
    let scene = manager.current;
    now += 5000;
    tapBoard(scene, 7, 7);
    assert.equal(scene.currentPlayer, 2);
    assert.equal(scene.deadline, 0, 'AI thinking must not consume player time');
    scene.clearAiTimer();
    scene.performAiMove({ row: 7, col: 8 });
    const firstDeadline = scene.deadline;
    now += 1000;
    scene.undo();
    assert.equal(scene.board[7][7], 0);
    assert.equal(scene.board[7][8], 0);
    assert.equal(scene.undoLeft, 1);
    assert(
      scene.deadline <= now + 24000 && scene.deadline < firstDeadline,
      'undo must retain the time already spent',
    );
    const saved = store.load(wx);
    assert(
      saved && saved.undoLeft === 1 && saved.moves === 0,
      'empty board after undo must preserve its quota and timer',
    );
    manager.go('home');
    manager.go('aiGame', { resume: saved });
    scene = manager.current;
    assert.equal(scene.undoLeft, 1);
    assert.equal(scene.deadline, saved.deadline);
    tapBoard(scene, 6, 6);
    scene.undo();
    assert.equal(scene.undoLeft, 0);
    assert.equal(scene.currentPlayer, 1);
    assert.equal(scene.aiTimer, null, 'undo while AI is waiting must cancel its move');
    tapBoard(scene, 7, 7);
    scene.clearAiTimer();
    scene.performAiMove({ row: 7, col: 8 });
    const boardBefore = JSON.stringify(scene.board);
    scene.undo();
    assert.equal(JSON.stringify(scene.board), boardBefore, 'quota cannot be bypassed');
    scene.onHide();
    now = scene.deadline;
    scene.onResume();
    assert(scene.gameOver && scene.finishReason === 'timeout');
    assert.equal(store.load(wx), null);
    assert.equal(progress.read(wx).ai.normal.loss, 1);
    scene.undo();
    assert.equal(JSON.stringify(scene.board), boardBefore, 'finished match cannot be undone');
    manager.go('localGame', { rules: { turnSeconds: 30, allowUndo: true, undoLimit: 2 } });
    scene = manager.current;
    now += 5000;
    tapBoard(scene, 7, 7);
    scene.requestUndo();
    assert(scene.pendingUndo);
    tapBoard(scene, 6, 6);
    assert.equal(scene.board[6][6], 0, 'pending consent blocks board input');
    now += 1000;
    scene.respondUndo(true);
    assert.equal(scene.currentPlayer, 1);
    assert.equal(scene.board[7][7], 0);
    assert.equal(scene.undoUsed[1], 1);
    assert(scene.deadline <= now + 24000);
    tapBoard(scene, 7, 7);
    scene.requestUndo();
    scene.respondUndo(false);
    assert.equal(scene.undoUsed[1], 2);
    scene.requestUndo();
    assert.equal(scene.pendingUndo, null);
    scene.onHide();
    now = scene.deadline;
    scene.onResume();
    assert(
      scene.gameOver && scene.winnerPiece === 1,
      'backgrounded white turn expires and black wins',
    );
    manager.go('puzzleGame', { puzzleId: 'p01' });
    scene = manager.current;
    now += 180000;
    assert.equal(scene.deadline, 0);
    assert(!scene.checkTimeout());
    assert(!scene.rules.allowUndo, 'puzzles use retry, not competitive undo');
    manager.go('home');
    const Online = require('../game/scenes/onlineGameScene');
    manager.go('aiGame',{rules:{turnSeconds:0,allowUndo:true}});const sleeping=manager.current;manager.suspend();
    const delayed={clientX:sleeping.boardRect.x+sleeping.boardRect.width/2,clientY:sleeping.boardRect.y+sleeping.boardRect.height/2};
    manager.handleTouchStart({touches:[delayed]});manager.handleTouchEnd({changedTouches:[delayed]});assert.equal(sleeping.moves,0,'late native touches must not change a backgrounded match');manager.resume();manager.go('home');
    const remote = {
      status: 'playing',
      host: { nickname: '黑方' },
      guest: { nickname: '白方' },
      currentTurn: 'host',
      board: Array.from({ length: 15 }, () => Array(15).fill(0)),
      rules: { version: 1, turnSeconds: 30, allowUndo: true, undoLimit: 2 },
      turnDeadline: now - 120000 + 30000,
      moveCount: 0,
    };
    const client = new Online(
      {
        ...manager.runtime,
        manager: { render() {}, go() {} },
        cloud: {
          getRoom: () => Promise.resolve(remote),
          syncRoom: () =>
            Promise.resolve({
              serverNow: now - 120000,
              roomData:
                now - 120000 >= remote.turnDeadline
                  ? {
                      ...remote,
                      status: 'finished',
                      winner: 'guest',
                      finishReason: 'timeout',
                      timedOutBy: 'host',
                      turnDeadline: 0,
                    }
                  : remote,
            }),
        },
      },
      { roomId: '123456', viewId: 'a'.repeat(36), role: 'host' },
    );
    client.active = true;
    await client.loadRoom();
    client.render(runtime.manager.runtime.ctx, new (require('../game/core/inputManager'))());
    assert.equal(client.serverOffset, -120000);
    assert.equal(
      client.boardLocked,
      false,
      'server clock calibration must prevent a false timeout on a skewed phone',
    );
    now += 30000;
    tapBoard(client, 7, 7);
    assert.equal(client.board[7][7], 0, 'expired client clock must block optimistic local moves');
    await client.loadRoom();
    assert(client.gameOver && client.finishReason === 'timeout');
    assert.equal(client.getWinnerRole(), 'guest');
    client.onExit();
    const queued = [];
    const late = new Online(
      {
        ...manager.runtime,
        manager: { render() {}, go() {} },
        cloud: {
          syncRoom: () => new Promise((resolve) => queued.push(resolve)),
          watchRoom: () => ({ close() {} }),
        },
      },
      { roomId: '123456', viewId: 'a'.repeat(36), role: 'host' },
    );
    late.active = true;
    late.ruleVersion = 1;
    const oldRead = late.loadRoom();
    late.onHide();
    late.onResume();
    const freshBoard = remote.board.map((row) => row.slice());
    freshBoard[7][7] = 1;
    queued[1]({
      serverNow: now - 120000,
      roomData: {
        ...remote,
        board: freshBoard,
        currentTurn: 'guest',
        turnDeadline: now - 120000 + 60000,
      },
    });
    await new Promise(setImmediate);
    queued[0]({ serverNow: now + 60000, roomData: remote });
    await oldRead;
    assert.equal(
      late.serverOffset,
      -120000,
      'a pre-background response must not poison the resumed server clock',
    );
    assert.equal(
      late.board[7][7],
      1,
      'a pre-background response must not roll back the current board',
    );
    late.onExit();
    for (const [w, h] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
    ]) {
      const t = createTestRuntime(w, h);
      t.wx.getMenuButtonBoundingClientRect = () => ({ bottom: 96, right: w - 20 });
      t.runtime.manager.runtime.bottomInset = 34;
      for (const [name, params] of [
        ['matchSetup', { mode: 'friend' }],
        ['aiGame', {}],
        ['localGame', {}],
        ['settings', {}],
      ]) {
        t.runtime.manager.go(name, params);
        const areas = t.runtime.manager.input.hitAreas;
        for (const { rect } of areas)
          assert(
            rect.x >= 0 &&
              rect.y >= 108 &&
              rect.x + rect.width <= w + 0.01 &&
              rect.y + rect.height <= h - 34 + 0.01 &&
              rect.height >= 38,
            `${name} unsafe target ${w}x${h}: ${JSON.stringify(rect)}`,
          );
        // Distinct controls must remain independently touchable.
        for (let i = 0; i < areas.length; i++)
          for (let j = i + 1; j < areas.length; j++) {
            const a = areas[i].rect,
              b = areas[j].rect;
            assert(
              !(
                a.x < b.x + b.width &&
                b.x < a.x + a.width &&
                a.y < b.y + b.height &&
                b.y < a.y + a.height
              ),
              `${name}: controls overlap`,
            );
          }
      }
      t.runtime.manager.go('home');
    }
    console.log(
      'Offline turn clocks, background expiry, persistent undo, consent, quotas, puzzle exemption and four-size rules UI verified',
    );
  } finally {
    Date.now = oldNow;
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
