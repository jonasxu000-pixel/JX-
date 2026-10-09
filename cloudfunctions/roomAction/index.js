const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const matchRules = require('./matchRules');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const rooms = db.collection('rooms');
const roomViews = db.collection('roomViews');

const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const ROOM_SCHEMA_VERSION = 2;
const WAITING_ROOM_TTL_MS = 30 * 60 * 1000;
const ACTIVE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 20;
const ROOM_ACTION_VERSION = 'roomAction-20261009-release-10';
const gomokuRules = require('./gomokuRules');
const DIAGNOSTIC_ACTIONS = new Set([
  'selfTestMove',
  'selfTestMatch',
  'selfTestConcurrentMove',
  'selfTestWatchRoom',
  'selfTestJoinRoom',
]);

function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

function createRestartReady() {
  return {
    host: false,
    guest: false,
  };
}

function sanitizePlayerProfile(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const nickname = String(source.nickname || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 12) || '棋友';
  const rawAvatarUrl = String(source.avatarUrl || '').trim();
  const avatarUrl = /^https:\/\//i.test(rawAvatarUrl)
    ? rawAvatarUrl.slice(0, 1024)
    : '';
  return {
    nickname,
    avatarUrl,
  };
}

function normalizeBoard(board) {
  const emptyBoard = createBoard();

  if (!Array.isArray(board)) {
    return emptyBoard;
  }

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (!Array.isArray(board[row])) {
      continue;
    }

    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = Number(board[row][col]);
      emptyBoard[row][col] = piece === BLACK || piece === WHITE ? piece : EMPTY;
    }
  }

  return emptyBoard;
}

function isValidPos(row, col) {
  return Number.isInteger(row)
    && Number.isInteger(col)
    && row >= 0
    && row < BOARD_SIZE
    && col >= 0
    && col < BOARD_SIZE;
}

function checkWin(board, row, col, piece) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  return directions.some(([dx, dy]) => {
    let count = 1;

    for (let step = 1; step < 5; step += 1) {
      const nextRow = row + dx * step;
      const nextCol = col + dy * step;
      if (!isValidPos(nextRow, nextCol) || board[nextRow][nextCol] !== piece) {
        break;
      }
      count += 1;
    }

    for (let step = 1; step < 5; step += 1) {
      const nextRow = row - dx * step;
      const nextCol = col - dy * step;
      if (!isValidPos(nextRow, nextCol) || board[nextRow][nextCol] !== piece) {
        break;
      }
      count += 1;
    }

    return count >= 5;
  });
}

function isBoardFull(board) {
  return board.every(row => row.every(piece => piece !== EMPTY));
}

function getPlayerRole(room, openId) {
  if (room.host && room.host.openId === openId) {
    return 'host';
  }

  if (room.guest && room.guest.openId === openId) {
    return 'guest';
  }

  return null;
}

function roleToPiece(role, room) {
  const color = room && room[role] && room[role].color;
  return color ? (color === 'black' ? BLACK : WHITE) : role === 'host' ? BLACK : WHITE;
}

function nextRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

function createUniqueRoomId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createViewId() {
  return crypto.randomBytes(18).toString('hex');
}

function createExpiresAt(status, now = Date.now()) {
  const ttl = status === 'waiting' ? WAITING_ROOM_TTL_MS : ACTIVE_ROOM_TTL_MS;
  return new Date(now + ttl);
}

function getTime(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return 0;
}

function isRoomExpired(room, now = Date.now()) {
  const expiresAt = getTime(room && room.expiresAt);
  return expiresAt > 0 && expiresAt <= now;
}

function isCurrentRoomVersion(room) {
  return Boolean(
    room
    && room.schemaVersion === ROOM_SCHEMA_VERSION
    && /^[a-f0-9]{36}$/i.test(String(room.viewId || '')),
  );
}

function toPublicPlayer(player) {
  if (!player) return null;
  return {
    color: player.color,
    ...sanitizePlayerProfile(player),
  };
}

function toPublicRoom(room) {
  return {
    schemaVersion: ROOM_SCHEMA_VERSION,
    host: toPublicPlayer(room.host),
    guest: toPublicPlayer(room.guest),
    currentTurn: room.currentTurn,
    board: normalizeBoard(room.board),
    lastMove: room.lastMove
      ? {
          row: room.lastMove.row,
          col: room.lastMove.col,
          piece: room.lastMove.piece,
          role: room.lastMove.role,
        }
      : null,
    winner: room.winner || null,
    status: room.status,
    finishReason: room.finishReason || null,
    surrenderedBy: room.surrenderedBy || null,
    timedOutBy: room.timedOutBy || null,
    foulReason: room.foulReason || null,
    roundNumber: room.roundNumber || 1,
    rules: matchRules.normalize(room.rules),
    turnDeadline: room.turnDeadline || 0,
    moveCount: (room.moveHistory || []).length,
    undoRequestsUsed: room.undoRequestsUsed || { host: 0, guest: 0 },
    pendingUndo: room.pendingUndo || null,
    restartReady: room.restartReady || createRestartReady(),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    expiresAt: room.expiresAt,
  };
}

function withoutDocumentId(document) {
  const { _id, ...data } = document;
  return data;
}

async function replaceRoomAndView(transaction, roomDoc, room, updates) {
  const updatedAt = new Date();
  const nextStatus = updates.status || room.status;
  const nextRoom = {
    ...room,
    ...updates,
    schemaVersion: ROOM_SCHEMA_VERSION,
    updatedAt,
    expiresAt: createExpiresAt(nextStatus, updatedAt.getTime()),
  };

  await roomDoc.set({ data: withoutDocumentId(nextRoom) });
  if (nextRoom.viewId) {
    await transaction.collection('roomViews').doc(nextRoom.viewId).set({
      data: toPublicRoom(nextRoom),
    });
  }

  return nextRoom;
}

async function removeRoomAndView(transaction, roomDoc, room) {
  if (room && room.viewId) {
    await transaction.collection('roomViews').doc(room.viewId).remove();
  }
  await roomDoc.remove();
}

async function cleanupExpiredRooms() {
  const now = new Date();
  const expired = await rooms
    .where({ expiresAt: _.lt(now) })
    .limit(CLEANUP_BATCH_SIZE)
    .get();
  const documents = (expired && expired.data) || [];

  await Promise.all(documents.map(async room => {
    if (room.viewId) {
      await roomViews.doc(room.viewId).remove().catch(() => {});
    }
    await rooms.doc(room._id).remove().catch(() => {});
  }));

  return documents.length;
}

function isTransactionConflict(err) {
  const message = String(err && (err.message || err.errMsg || err));
  return message.includes('TransactionConflict');
}

async function runTransactionWithRetry(updateFunction, maxAttempts = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await db.runTransaction(updateFunction);
    } catch (err) {
      lastError = err;
      if (!isTransactionConflict(err)) throw err;
    }
  }

  throw lastError;
}

async function joinRoomForOpenId(targetRoomId, openId, playerProfile, ruleVersion) {
  if (!targetRoomId) {
    return { success: false, error: '房间号不能为空' };
  }

  return runTransactionWithRetry(async (transaction) => {
    const roomDoc = transaction.collection('rooms').doc(targetRoomId);
    const roomRes = await roomDoc.get();
    const room = roomRes.data;

    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (!isCurrentRoomVersion(room)) {
      return { success: false, error: '房间版本已过期，请重新创建' };
    }

    if (isRoomExpired(room)) {
      await removeRoomAndView(transaction, roomDoc, room);
      return { success: false, error: '房间已过期，请重新创建' };
    }

    if (room.status !== 'waiting') {
      return { success: false, error: '房间不可加入' };
    }
    if (matchRules.normalize(room.rules).version > (ruleVersion || 0))
      return { success: false, error: '房间使用新版计时规则，请更新小游戏后加入' };

    if (room.host && room.host.openId === openId) {
      return { success: false, error: '不能加入自己创建的房间' };
    }

    await replaceRoomAndView(transaction, roomDoc, room, {
      guest: {
        openId,
        color: roleToPiece('host', room) === BLACK ? 'white' : 'black',
        ...sanitizePlayerProfile(playerProfile),
      },
      status: 'playing',
      restartReady: createRestartReady(),
      finishReason: null,
      surrenderedBy: null,
      turnDeadline: matchRules.deadline(room),
      turnStartedAt: Date.now(),
      pendingUndo: null,
      timedOutBy: null,
    });

    return {
      success: true,
      viewId: room.viewId,
      role: 'guest',
      color: roleToPiece('host', room) === BLACK ? 'white' : 'black',
    };
  });
}

async function placePieceForOpenId(targetRoomId, targetRow, targetCol, openId) {
  if (!targetRoomId) {
    return { success: false, error: '房间号不能为空' };
  }

  if (!isValidPos(targetRow, targetCol)) {
    return { success: false, error: '落子位置无效' };
  }

  return runTransactionWithRetry(async (transaction) => {
    const roomDoc = transaction.collection('rooms').doc(targetRoomId);
    const roomRes = await roomDoc.get();
    let room = roomRes.data;

    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (isRoomExpired(room)) {
      await removeRoomAndView(transaction, roomDoc, room);
      return { success: false, error: '房间已过期，请重新创建' };
    }

    if (room.status !== 'playing') {
      return { success: false, error: '当前房间不可落子' };
    }

    const role = getPlayerRole(room, openId);
    if (!role) {
      return { success: false, error: '你不在当前房间中' };
    }

    if (!room.host || !room.guest) {
      return { success: false, error: '对手已退出，当前对局已结束' };
    }
    const placedAt = Date.now();
    const updates = matchRules.expiration(room, placedAt);
    if (updates) {
      room = await replaceRoomAndView(transaction, roomDoc, room, updates);
      if (room.status === 'finished')
        return {
          success: true,
          timeout: true,
          roomData: toPublicRoom(room),
          serverNow: Date.now(),
        };
    }
    if (room.pendingUndo) return { success: false, error: '请先完成悔棋确认' };

    if (room.currentTurn !== role) {
      return { success: false, error: '还没有轮到你落子' };
    }

    const nextBoard = normalizeBoard(room.board);
    if (nextBoard[targetRow][targetCol] !== EMPTY) {
      return { success: false, error: '当前位置已有棋子' };
    }

    const piece = roleToPiece(role, room);
    const rules = matchRules.normalize(room.rules);
    const openingError = gomokuRules.openingError(nextBoard, targetRow, targetCol, piece, rules);
    if (openingError) return { success: false, error: openingError };
    const remainingMs = room.turnDeadline ? Math.max(0, room.turnDeadline - placedAt) : null;
    nextBoard[targetRow][targetCol] = piece;

    const judgement = gomokuRules.adjudicate(nextBoard, targetRow, targetCol, piece, rules.ruleSet);
    const hasWinner = judgement.win;
    const hasFoul = Boolean(judgement.foul);
    const hasDraw = !hasWinner && !hasFoul && isBoardFull(nextBoard);
    const nextStatus = hasWinner || hasFoul || hasDraw ? 'finished' : 'playing';
    const winner = hasFoul ? nextRole(role) : hasWinner ? role : null;
    const nextTurn = nextStatus === 'finished' ? role : nextRole(role);
    const lastMove = {
      row: targetRow,
      col: targetCol,
      piece,
      role,
    };

    await replaceRoomAndView(transaction, roomDoc, room, {
      board: nextBoard,
      lastMove,
      currentTurn: nextTurn,
      winner,
      status: nextStatus,
      finishReason: hasFoul ? 'foul' : hasWinner ? 'five' : hasDraw ? 'draw' : null,
      foulReason: judgement.foulText || null,
      surrenderedBy: null,
      restartReady: createRestartReady(),
      moveHistory: [...(room.moveHistory || []), { ...lastMove, remainingMs }],
      turnDeadline: nextStatus === 'playing' ? matchRules.deadline(room, placedAt) : 0,
      turnStartedAt: nextStatus === 'playing' ? placedAt : 0,
      pendingUndo: null,
    });

    return {
      success: true,
      board: nextBoard,
      lastMove,
      currentTurn: nextTurn,
      winner,
      status: nextStatus,
      serverNow: Date.now(),
    };
  });
}

async function surrenderRoomForOpenId(targetRoomId, openId) {
  if (!targetRoomId) {
    return { success: false, error: '房间号不能为空' };
  }

  return runTransactionWithRetry(async transaction => {
    const roomDoc = transaction.collection('rooms').doc(targetRoomId);
    const roomRes = await roomDoc.get();
    let room = roomRes.data;

    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (isRoomExpired(room)) {
      await removeRoomAndView(transaction, roomDoc, room);
      return { success: false, error: '房间已过期，请重新创建' };
    }

    if (room.status !== 'playing') {
      return { success: false, error: '当前对局不可投降' };
    }

    const role = getPlayerRole(room, openId);
    if (!role) {
      return { success: false, error: '你不在当前房间中' };
    }

    if (!room.host || !room.guest) {
      return { success: false, error: '对手已离开，当前对局已结束' };
    }

    const elapsed=matchRules.expiration(room);
    if(elapsed){room=await replaceRoomAndView(transaction,roomDoc,room,elapsed);if(room.status==='finished')return {success:true,timeout:true,roomData:toPublicRoom(room),serverNow:Date.now()};}

    const winner = nextRole(role);
    await replaceRoomAndView(transaction, roomDoc, room, {
      currentTurn: winner,
      winner,
      status: 'finished',
      finishReason: 'surrender',
      surrenderedBy: role,
      pendingUndo:null,turnDeadline:0,
      restartReady: createRestartReady(),
    });

    return {
      success: true,
      winner,
      status: 'finished',
      finishReason: 'surrender',
      surrenderedBy: role,
    };
  });
}

async function restartRoomForOpenId(targetRoomId, openId) {
  if (!targetRoomId) {
    return { success: false, error: '房间号不能为空' };
  }

  return runTransactionWithRetry(async (transaction) => {
    const roomDoc = transaction.collection('rooms').doc(targetRoomId);
    const roomRes = await roomDoc.get();
    const room = roomRes.data;

    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (isRoomExpired(room)) {
      await removeRoomAndView(transaction, roomDoc, room);
      return { success: false, error: '房间已过期，请重新创建' };
    }

    const role = getPlayerRole(room, openId);
    if (!role) {
      return { success: false, error: '你不在当前房间中' };
    }

    if (!room.host || !room.guest) {
      return { success: false, error: '等待双方进入后才能再来一局' };
    }

    if (room.status !== 'finished') {
      return { success: false, error: '当前对局尚未结束' };
    }

    const restartReady = {
      ...createRestartReady(),
      ...(room.restartReady || {}),
      [role]: true,
    };
    const bothReady = restartReady.host && restartReady.guest;

    if (!bothReady) {
      await replaceRoomAndView(transaction, roomDoc, room, { restartReady });
      return {
        success: true,
        restarted: false,
        status: 'finished',
        restartReady,
      };
    }

    const nextBoard = createBoard();
    const rules = matchRules.normalize(room.rules);
    const oldBlack = roleToPiece('host', room) === BLACK ? 'host' : 'guest';
    const blackRole =
      rules.version === 2
        ? rules.rematch === 'loser' && room.winner
          ? nextRole(room.winner)
          : nextRole(oldBlack)
        : 'host';
    const colors = {
      host: { ...room.host, color: blackRole === 'host' ? 'black' : 'white' },
      guest: { ...room.guest, color: blackRole === 'guest' ? 'black' : 'white' },
    };
    await replaceRoomAndView(transaction, roomDoc, room, {
      ...colors,
      roundNumber: (room.roundNumber || 1) + 1,
      foulReason: null,
      board: nextBoard,
      lastMove: null,
      currentTurn: blackRole,
      winner: null,
      status: 'playing',
      finishReason: null,
      surrenderedBy: null,
      restartReady: createRestartReady(),
      turnDeadline: matchRules.deadline(room),
      turnStartedAt: Date.now(),
      moveHistory: [],
      pendingUndo: null,
      timedOutBy: null,
      undoRequestsUsed: { host: 0, guest: 0 },
    });

    return {
      success: true,
      board: nextBoard,
      currentTurn: blackRole,
      winner: null,
      status: 'playing',
      restarted: true,
      restartReady: createRestartReady(),
    };
  });
}

async function ruleAction(targetRoomId, openId, event) {
  if (!/^\d{6}$/.test(String(targetRoomId || ''))) return { success: false, error: '房间号无效' };
  return runTransactionWithRetry(async (transaction) => {
    const doc = transaction.collection('rooms').doc(targetRoomId);
    const fetched = await doc.get().catch((error) => {
      const message = String((error && (error.message || error.errMsg)) || '');
      if (/document.*(?:not found|not exist|does not exist)/i.test(message)) return { data: null };
      throw error;
    });
    let room = fetched.data;
    if (!room) return { success: true, serverNow: Date.now(), roomData: null };
    const role = getPlayerRole(room, openId);
    if (!role) return { success: false, error: '你不在当前房间中' };
    if (isRoomExpired(room)) {
      await removeRoomAndView(transaction, doc, room);
      return { success: false, error: '房间已过期，请重新创建' };
    }
    const now = Date.now();
    const elapsed = matchRules.expiration(room, now);
    if (elapsed) room = await replaceRoomAndView(transaction, doc, room, elapsed);
    const reply = () => ({ success: true, serverNow: Date.now(), roomData: toPublicRoom(room) });
    if (event.action === 'syncRoom') return reply();
    if (room.status !== 'playing' || !room.host || !room.guest)
      return { success: false, error: '对局结束后不能悔棋' };
    const rules = matchRules.normalize(room.rules);
    if (!rules.allowUndo) return { success: false, error: '本局不允许悔棋' };
    const history = room.moveHistory || [];
    if (event.action === 'requestUndo') {
      if (room.pendingUndo) return { success: false, error: '已有悔棋申请等待处理' };
      const removeCount = rules.version === 2 && rules.undoScope === 'move' ? 1 : 2;
      if (
        history.length < removeCount ||
        history[history.length - removeCount].role !== role ||
        (removeCount === 2 && room.currentTurn !== role)
      )
        return {
          success: false,
          error:
            removeCount === 1 ? '只能申请撤回自己刚落下的上一手' : '轮到你时，才能申请退回上一轮',
        };
      const used = room.undoRequestsUsed || { host: 0, guest: 0 };
      if ((used[role] || 0) >= rules.undoLimit)
        return { success: false, error: '本局悔棋申请次数已用尽' };
      room = await replaceRoomAndView(transaction, doc, room, {
        undoRequestsUsed: { ...used, [role]: (used[role] || 0) + 1 },
        pendingUndo: {
          id: crypto.randomBytes(12).toString('hex'),
          by: role,
          requestedAt: now,
          expiresAt: room.turnDeadline ? Math.min(now + 15000, room.turnDeadline) : now + 15000,
          moveCount: history.length,
          removeCount,
        },
      });
      return reply();
    }
    const pending = room.pendingUndo;
    if (!pending || pending.id !== event.requestId)
      return { success: false, error: '悔棋申请已失效' };
    if (event.action === 'cancelUndo') {
      if (pending.by !== role) return { success: false, error: '只能取消自己的悔棋申请' };
      room = await replaceRoomAndView(transaction, doc, room, { pendingUndo: null });
      return reply();
    }
    if (pending.by === role || typeof event.accept !== 'boolean')
      return { success: false, error: '请等待对手确认悔棋' };
    if (!event.accept) {
      room = await replaceRoomAndView(transaction, doc, room, { pendingUndo: null });
      return reply();
    }
    const removeCount = pending.removeCount === 1 ? 1 : 2;
    if (history.length !== pending.moveCount || history.length < removeCount)
      return { success: false, error: '棋局已变化，请重新申请' };
    const removed = history.slice(-removeCount);
    const nextBoard = normalizeBoard(room.board);
    if (
      removed[0].role !== pending.by ||
      (removeCount === 2 && removed[1].role === pending.by) ||
      removed.some(
        (move) => !isValidPos(move.row, move.col) || nextBoard[move.row][move.col] !== move.piece,
      )
    )
      return { success: false, error: '棋局记录不完整，不能悔棋' };
    removed.forEach((move) => {
      nextBoard[move.row][move.col] = EMPTY;
    });
    const nextHistory = history.slice(0, -removeCount);
    const remaining = room.turnDeadline
      ? Math.max(
          0,
          Math.min(
            room.turnDeadline - now,
            Number.isFinite(removed[0].remainingMs)
              ? removed[0].remainingMs -
                  Math.max(
                    0,
                    now -
                      (removeCount === 1
                        ? pending.requestedAt
                        : room.turnStartedAt || room.turnDeadline - rules.turnSeconds * 1000),
                  )
              : room.turnDeadline - now,
          ),
        )
      : 0;
    const restored = {
      board: nextBoard,
      moveHistory: nextHistory,
      lastMove: nextHistory[nextHistory.length - 1] || null,
      currentTurn: pending.by,
      pendingUndo: null,
      turnDeadline: rules.turnSeconds ? now + remaining : 0,
      turnStartedAt: rules.turnSeconds ? now : 0,
    };
    const expired = matchRules.expiration({ ...room, ...restored }, now);
    room = await replaceRoomAndView(transaction, doc, room, { ...restored, ...expired });
    return reply();
  });
}

async function leaveRoomForOpenId(targetRoomId, openId) {
  if (!targetRoomId) {
    return { success: false, error: '房间号不能为空' };
  }

  return runTransactionWithRetry(async transaction => {
    const roomDoc = transaction.collection('rooms').doc(targetRoomId);
    const roomRes = await roomDoc.get().catch(err => {
      // 已删除的房间视为退出完成；网络/权限错误仍必须交给外层错误边界。
      const message = String(err && (err.message || err.errMsg) || '');
      if (/document.*(?:not found|not exist|does not exist)/i.test(message)) {
        return { data: null };
      }
      throw err;
    });
    const room = roomRes.data;
    if (!room) return { success: true };

    if (isRoomExpired(room)) {
      await removeRoomAndView(transaction, roomDoc, room);
      return { success: true, roomClosed: true };
    }

    const role = getPlayerRole(room, openId);
    if (!role) return { success: true };

    if (role === 'host') {
      await removeRoomAndView(transaction, roomDoc, room);
      return { success: true, roomClosed: true };
    }

    await replaceRoomAndView(transaction, roomDoc, room, {
      guest: null,
      status: 'waiting',
      currentTurn: 'host',
      board: createBoard(),
      lastMove: null,
      winner: null,
      finishReason: null,
      surrenderedBy: null,
      restartReady: createRestartReady(),
      turnDeadline:0,pendingUndo:null,moveHistory:[],undoRequestsUsed:{host:0,guest:0},timedOutBy:null,
    });
    return { success: true, opponentLeft: true };
  });
}

exports.main = async (event = {}) => {
  const {
    action,
    roomId,
    row,
    col,
    playerProfile,
  } = event;
  const wxContext = cloud.getWXContext();
  const callerOpenId = wxContext.OPENID;

  try {
    if (DIAGNOSTIC_ACTIONS.has(action) && process.env.ENABLE_ROOM_DIAGNOSTICS !== 'true') {
      return {
        success: false,
        error: '诊断操作未启用',
      };
    }

    switch (action) {
      case 'ping':
        await cleanupExpiredRooms().catch(err => console.warn('room cleanup skipped:', err));
        return {
          success: true,
          version: ROOM_ACTION_VERSION,
          env: wxContext.ENV,
          time: Date.now(),
          ruleVersion:1,
          advancedRuleVersion:2,
        };

      case 'createRoom': {
        await cleanupExpiredRooms().catch(err => console.warn('room cleanup skipped:', err));
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const newRoomId = createUniqueRoomId();
          const viewId = createViewId();
          const createdAt = new Date();
          const rules = matchRules.normalize([1,2].includes(event.ruleVersion)?{...event.rules,version:event.ruleVersion}:null);
          const hostBlack = rules.version !== 2 || crypto.randomBytes(1)[0] < 128;
          const roomData = {
            _id: newRoomId,
            schemaVersion: ROOM_SCHEMA_VERSION,
            viewId,
            host: {
              openId: callerOpenId,
              color: hostBlack ? 'black' : 'white',
              ...sanitizePlayerProfile(playerProfile),
            },
            guest: null,
            currentTurn: hostBlack ? 'host' : 'guest',
            board: createBoard(),
            lastMove: null,
            winner: null,
            status: 'waiting',
            finishReason: null,
            surrenderedBy: null,
            restartReady: createRestartReady(),
            createdAt,
            updatedAt: createdAt,
            expiresAt: createExpiresAt('waiting', createdAt.getTime()),
            rules, roundNumber:1, foulReason:null,
            turnDeadline:0,moveHistory:[],pendingUndo:null,undoRequestsUsed:{host:0,guest:0},timedOutBy:null,
          };

          try {
            await rooms.add({ data: roomData });
            try {
              await roomViews.add({
                data: {
                  _id: viewId,
                  ...toPublicRoom(roomData),
                },
              });
            } catch (err) {
              await rooms.doc(newRoomId).remove().catch(() => {});
              throw err;
            }

            return {
              success: true,
              roomId: newRoomId,
              viewId,
              role: 'host',
              color: hostBlack ? 'black' : 'white',
            };
          } catch (err) {
            if (attempt === 4) throw err;
          }
        }

        return { success: false, error: '创建房间失败，请重试' };
      }

      case 'selfTestMove': {
        const testRoomId = `TEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
          await rooms.add({
            data: {
              _id: testRoomId,
              host: {
                openId: callerOpenId,
                color: 'black',
              },
              guest: {
                openId: '__self_test_guest__',
                color: 'white',
              },
              currentTurn: 'host',
              board: createBoard(),
              lastMove: null,
              winner: null,
              status: 'playing',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate(),
            },
          });

          const moveResult = await placePieceForOpenId(testRoomId, 7, 7, callerOpenId);
          if (!moveResult.success) {
            return {
              success: false,
              version: ROOM_ACTION_VERSION,
              error: moveResult.error || '云端落子自检失败',
            };
          }

          const verifyRes = await rooms.doc(testRoomId).get();
          const testRoom = verifyRes.data || {};
          const savedBoard = normalizeBoard(testRoom.board);
          const savedLastMove = testRoom.lastMove || {};
          const ok = savedBoard[7][7] === BLACK
            && savedLastMove.row === 7
            && savedLastMove.col === 7
            && testRoom.currentTurn === 'guest'
            && testRoom.status === 'playing';

          return {
            success: ok,
            version: ROOM_ACTION_VERSION,
            roomId: testRoomId,
            currentTurn: testRoom.currentTurn,
            lastMove: savedLastMove,
            piece: savedBoard[7][7],
            error: ok ? '' : '云端落子写入后读取校验失败',
          };
        } finally {
          await rooms.doc(testRoomId).remove().catch(() => {});
        }
      }

      case 'selfTestMatch': {
        const testRoomId = `TEST_MATCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const hostOpenId = '__self_test_host__';
        const guestOpenId = '__self_test_guest__';

        try {
          await rooms.add({
            data: {
              _id: testRoomId,
              host: {
                openId: hostOpenId,
                color: 'black',
              },
              guest: {
                openId: guestOpenId,
                color: 'white',
              },
              currentTurn: 'host',
              board: createBoard(),
              lastMove: null,
              winner: null,
              status: 'playing',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate(),
            },
          });

          const guestEarlyMove = await placePieceForOpenId(testRoomId, 1, 0, guestOpenId);
          if (guestEarlyMove.success) {
            return {
              success: false,
              version: ROOM_ACTION_VERSION,
              error: '非当前回合的加入者落子未被拒绝',
            };
          }

          const moves = [
            { openId: hostOpenId, role: 'host', row: 0, col: 0, piece: BLACK },
            { openId: guestOpenId, role: 'guest', row: 1, col: 0, piece: WHITE },
            { openId: hostOpenId, role: 'host', row: 0, col: 1, piece: BLACK },
            { openId: guestOpenId, role: 'guest', row: 1, col: 1, piece: WHITE },
            { openId: hostOpenId, role: 'host', row: 0, col: 2, piece: BLACK },
            { openId: guestOpenId, role: 'guest', row: 1, col: 2, piece: WHITE },
            { openId: hostOpenId, role: 'host', row: 0, col: 3, piece: BLACK },
            { openId: guestOpenId, role: 'guest', row: 1, col: 3, piece: WHITE },
            { openId: hostOpenId, role: 'host', row: 0, col: 4, piece: BLACK },
          ];

          const applied = [];
          for (const move of moves) {
            const result = await placePieceForOpenId(testRoomId, move.row, move.col, move.openId);
            if (!result.success) {
              return {
                success: false,
                version: ROOM_ACTION_VERSION,
                error: `第 ${applied.length + 1} 手落子失败: ${result.error || ''}`,
              };
            }

            if (result.lastMove.piece !== move.piece || result.lastMove.role !== move.role) {
              return {
                success: false,
                version: ROOM_ACTION_VERSION,
                error: `第 ${applied.length + 1} 手角色/棋色错误`,
              };
            }

            applied.push(result.lastMove);
          }

          const verifyRes = await rooms.doc(testRoomId).get();
          const testRoom = verifyRes.data || {};
          const savedBoard = normalizeBoard(testRoom.board);
          const hostBlackLine = savedBoard[0].slice(0, 5).every(piece => piece === BLACK);
          const guestWhiteLine = savedBoard[1].slice(0, 4).every(piece => piece === WHITE);
          const ok = hostBlackLine
            && guestWhiteLine
            && testRoom.status === 'finished'
            && testRoom.winner === 'host'
            && testRoom.currentTurn === 'host'
            && testRoom.lastMove
            && testRoom.lastMove.row === 0
            && testRoom.lastMove.col === 4
            && testRoom.lastMove.piece === BLACK;

          return {
            success: ok,
            version: ROOM_ACTION_VERSION,
            roomId: testRoomId,
            moves: applied.length,
            status: testRoom.status,
            winner: testRoom.winner,
            currentTurn: testRoom.currentTurn,
            lastMove: testRoom.lastMove,
            hostBlackLine,
            guestWhiteLine,
            rejectedGuestEarlyMove: !guestEarlyMove.success,
            error: ok ? '' : '完整对局自检读回校验失败',
          };
        } finally {
          await rooms.doc(testRoomId).remove().catch(() => {});
        }
      }

      case 'selfTestConcurrentMove': {
        const testRoomId = `TEST_CONCURRENT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
          await rooms.add({
            data: {
              _id: testRoomId,
              host: {
                openId: callerOpenId,
                color: 'black',
              },
              guest: {
                openId: '__self_test_guest__',
                color: 'white',
              },
              currentTurn: 'host',
              board: createBoard(),
              lastMove: null,
              winner: null,
              status: 'playing',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate(),
            },
          });

          const results = await Promise.all([
            placePieceForOpenId(testRoomId, 4, 4, callerOpenId),
            placePieceForOpenId(testRoomId, 4, 5, callerOpenId),
          ]);
          const verifyRes = await rooms.doc(testRoomId).get();
          const testRoom = verifyRes.data || {};
          const savedBoard = normalizeBoard(testRoom.board);
          const succeeded = results.filter(result => result.success).length;
          const rejected = results.length - succeeded;
          const savedBlackPieces = savedBoard[4].slice(4, 6).filter(piece => piece === BLACK).length;
          const ok = succeeded === 1
            && rejected === 1
            && savedBlackPieces === 1
            && testRoom.currentTurn === 'guest';

          return {
            success: ok,
            version: ROOM_ACTION_VERSION,
            succeeded,
            rejected,
            savedBlackPieces,
            currentTurn: testRoom.currentTurn,
            lastMove: testRoom.lastMove,
            error: ok ? '' : '并发落子事务自检失败',
          };
        } finally {
          await rooms.doc(testRoomId).remove().catch(() => {});
        }
      }

      case 'selfTestWatchRoom': {
        const mode = event.mode || '';

        if (mode === 'create') {
          const testRoomId = `TEST_WATCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await rooms.add({
            data: {
              _id: testRoomId,
              host: {
                openId: callerOpenId,
                color: 'black',
              },
              guest: {
                openId: '__self_test_guest__',
                color: 'white',
              },
              currentTurn: 'host',
              board: createBoard(),
              lastMove: null,
              winner: null,
              status: 'playing',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate(),
            },
          });

          return {
            success: true,
            version: ROOM_ACTION_VERSION,
            roomId: testRoomId,
          };
        }

        if (!roomId || !roomId.startsWith('TEST_WATCH_')) {
          return { success: false, error: '无效的 watch 自检房间' };
        }

        const roomRes = await rooms.doc(roomId).get();
        const room = roomRes.data;
        if (!room || getPlayerRole(room, callerOpenId) !== 'host') {
          return { success: false, error: '无权操作 watch 自检房间' };
        }

        if (mode === 'move') {
          const result = await placePieceForOpenId(roomId, 7, 7, callerOpenId);
          return {
            ...result,
            version: ROOM_ACTION_VERSION,
          };
        }

        if (mode === 'cleanup') {
          await rooms.doc(roomId).remove();
          return {
            success: true,
            version: ROOM_ACTION_VERSION,
            cleaned: true,
          };
        }

        return { success: false, error: '未知的 watch 自检模式' };
      }

      case 'selfTestJoinRoom': {
        let testRoomId = '';
        let testViewId = '';

        try {
          for (let attempt = 0; attempt < 5; attempt += 1) {
            testRoomId = createUniqueRoomId();
            testViewId = createViewId();
            try {
              const createdAt = new Date();
              const roomData = {
                _id: testRoomId,
                schemaVersion: ROOM_SCHEMA_VERSION,
                viewId: testViewId,
                host: {
                  openId: callerOpenId,
                  color: 'black',
                },
                guest: null,
                currentTurn: 'host',
                board: createBoard(),
                lastMove: null,
                winner: null,
                status: 'waiting',
                finishReason: null,
                surrenderedBy: null,
                restartReady: createRestartReady(),
                createdAt,
                updatedAt: createdAt,
                expiresAt: createExpiresAt('waiting', createdAt.getTime()),
              };
              await rooms.add({ data: roomData });
              await roomViews.add({
                data: {
                  _id: testViewId,
                  ...toPublicRoom(roomData),
                },
              });
              break;
            } catch (err) {
              if (testRoomId) await rooms.doc(testRoomId).remove().catch(() => {});
              if (testViewId) await roomViews.doc(testViewId).remove().catch(() => {});
              testRoomId = '';
              testViewId = '';
              if (attempt === 4) throw err;
            }
          }

          const guestOpenIds = ['__self_test_join_guest_a__', '__self_test_join_guest_b__'];
          const results = await Promise.all(guestOpenIds.map(openId => joinRoomForOpenId(testRoomId, openId)));
          const accepted = results.find(result => result.success) || {};
          const succeeded = results.filter(result => result.success).length;
          const rejected = results.length - succeeded;
          const verifyRes = await rooms.doc(testRoomId).get();
          const testRoom = verifyRes.data || {};
          const ok = succeeded === 1
            && rejected === 1
            && accepted.role === 'guest'
            && accepted.color === 'white'
            && testRoom.status === 'playing'
            && testRoom.guest
            && guestOpenIds.includes(testRoom.guest.openId)
            && testRoom.guest.color === 'white';

          return {
            success: ok,
            version: ROOM_ACTION_VERSION,
            roomId: testRoomId,
            role: accepted.role,
            color: accepted.color,
            status: testRoom.status,
            guestColor: testRoom.guest && testRoom.guest.color,
            succeeded,
            rejected,
            error: ok ? '' : '加入房间云端自检失败',
          };
        } finally {
          if (testRoomId) {
            await rooms.doc(testRoomId).remove().catch(() => {});
          }
          if (testViewId) {
            await roomViews.doc(testViewId).remove().catch(() => {});
          }
        }
      }

      case 'joinRoom':
        return await joinRoomForOpenId(roomId, callerOpenId, playerProfile,event.ruleVersion);

      case 'syncRoom':
      case 'requestUndo':
      case 'respondUndo':
      case 'cancelUndo':
        return await ruleAction(roomId,callerOpenId,event);

      case 'placePiece':
        return await placePieceForOpenId(roomId, row, col, callerOpenId);

      case 'restartRoom':
        return await restartRoomForOpenId(roomId, callerOpenId);

      case 'surrenderRoom':
        return await surrenderRoomForOpenId(roomId, callerOpenId);

      case 'updateRoom':
        return {
          success: false,
          error: 'updateRoom 已废弃，请使用 placePiece',
        };

      case 'leaveRoom': {
        return await leaveRoomForOpenId(roomId, callerOpenId);
      }

      default:
        return {
          success: false,
          error: `未知操作: ${action || ''}`,
        };
    }
  } catch (err) {
    console.error('roomAction failed:', err);
    return {
      success: false,
      error: '房间服务暂时不可用，请稍后重试',
    };
  }
};
