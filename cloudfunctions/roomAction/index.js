const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const ROOM_ACTION_VERSION = 'roomAction-20260608-doc-update-1';

function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

function normalizeBoard(value) {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE) return createBoard();

  return Array.from({ length: BOARD_SIZE }, (_, row) => {
    const sourceRow = Array.isArray(value[row]) ? value[row] : [];
    return Array.from({ length: BOARD_SIZE }, (_, col) => {
      const piece = sourceRow[col];
      return piece === BLACK || piece === WHITE ? piece : EMPTY;
    });
  });
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
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (isValidPos(r, c) && board[r][c] === piece) count++;
      else break;
    }

    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (isValidPos(r, c) && board[r][c] === piece) count++;
      else break;
    }

    if (count >= 5) return true;
  }

  return false;
}

function getPlayerRole(room, openId) {
  if (room.host && room.host.openId === openId) return 'host';
  if (room.guest && room.guest.openId === openId) return 'guest';
  return null;
}

function roleToPiece(role) {
  return role === 'host' ? BLACK : WHITE;
}

function nextRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

async function createUniqueRoomId() {
  for (let i = 0; i < 5; i++) {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await db.collection('rooms').doc(roomId).get();
    } catch (err) {
      return roomId;
    }
  }
  throw new Error('房间号生成失败，请重试');
}

exports.main = async (event) => {
  const { action, roomId, row, col } = event;
  const wxContext = cloud.getWXContext();
  const callerOpenId = wxContext.OPENID;

  try {
    switch (action) {
      case 'ping':
        return {
          success: true,
          message: 'pong',
          version: ROOM_ACTION_VERSION,
          env: cloud.DYNAMIC_CURRENT_ENV,
          time: Date.now(),
        };

      case 'createRoom': {
        const newRoomId = await createUniqueRoomId();
        await db.collection('rooms').add({
          data: {
            _id: newRoomId,
            host: { openId: callerOpenId, color: 'black' },
            guest: null,
            currentTurn: 'host',
            board: createBoard(),
            lastMove: null,
            winner: null,
            status: 'waiting',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        });
        return { success: true, roomId: newRoomId };
      }

      case 'joinRoom': {
        const roomRes = await db.collection('rooms').doc(roomId).get();
        const room = roomRes.data;
        if (!room) return { success: false, error: '房间不存在' };
        if (room.host.openId === callerOpenId) return { success: false, error: '不能加入自己的房间' };
        if (room.status !== 'waiting') return { success: false, error: '房间不可加入' };
        if (room.guest) return { success: false, error: '房间已满' };

        await db.collection('rooms').doc(roomId).update({
          data: {
            guest: _.set({ openId: callerOpenId, color: 'white' }),
            status: 'playing',
            updatedAt: db.serverDate(),
          },
        });
        return { success: true, role: 'guest', color: 'white' };
      }

      case 'placePiece': {
        const roomRes = await db.collection('rooms').doc(roomId).get();
        const room = roomRes.data;
        if (!room) return { success: false, error: '房间不存在' };
        if (room.status !== 'playing') return { success: false, error: '游戏未开始或已结束' };

        const role = getPlayerRole(room, callerOpenId);
        if (!role) return { success: false, error: '你不在该房间中' };
        if (room.currentTurn !== role) return { success: false, error: '还没轮到你' };
        if (!isValidPos(row, col)) return { success: false, error: '落子位置无效' };

        const nextBoard = normalizeBoard(room.board);
        if (nextBoard[row][col] !== EMPTY) return { success: false, error: '该位置已有棋子' };

        const piece = roleToPiece(role);
        nextBoard[row][col] = piece;
        const hasWinner = checkWin(nextBoard, row, col, piece);

        await db.collection('rooms').doc(roomId).update({
          data: {
            board: nextBoard,
            lastMove: { row, col, piece, role },
            currentTurn: hasWinner ? role : nextRole(role),
            winner: hasWinner ? role : null,
            status: hasWinner ? 'finished' : 'playing',
            updatedAt: db.serverDate(),
          },
        });

        return {
          success: true,
          board: nextBoard,
          lastMove: { row, col, piece, role },
          currentTurn: hasWinner ? role : nextRole(role),
          winner: hasWinner ? role : null,
          status: hasWinner ? 'finished' : 'playing',
        };
      }

      case 'updateRoom':
        return { success: false, error: 'updateRoom 已废弃，请使用受校验的动作' };

      case 'leaveRoom': {
        const roomRes = await db.collection('rooms').doc(roomId).get();
        const room = roomRes.data;
        if (!room) return { success: true };

        const role = getPlayerRole(room, callerOpenId);
        if (role === 'host') {
          await db.collection('rooms').doc(roomId).remove();
        } else if (role === 'guest') {
          await db.collection('rooms').doc(roomId).update({
            data: {
              guest: null,
              status: 'waiting',
              board: createBoard(),
              lastMove: null,
              currentTurn: 'host',
              winner: null,
              updatedAt: db.serverDate(),
            },
          });
        }
        return { success: true };
      }

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (err) {
    console.error('roomAction failed:', err);
    return { success: false, error: err.message };
  }
};
