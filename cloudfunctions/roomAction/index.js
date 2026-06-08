const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const rooms = db.collection('rooms');

const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const ROOM_ACTION_VERSION = 'roomAction-20260608-self-test-placepiece-1';

function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
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

function getPlayerRole(room, openId) {
  if (room.host && room.host.openId === openId) {
    return 'host';
  }

  if (room.guest && room.guest.openId === openId) {
    return 'guest';
  }

  return null;
}

function roleToPiece(role) {
  return role === 'host' ? BLACK : WHITE;
}

function nextRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

function createUniqueRoomId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${timestamp}${random}`.slice(-8);
}

async function placePieceForOpenId(targetRoomId, targetRow, targetCol, openId) {
  if (!targetRoomId) {
    return { success: false, error: '房间号不能为空' };
  }

  if (!isValidPos(targetRow, targetCol)) {
    return { success: false, error: '落子位置无效' };
  }

  const roomRes = await rooms.doc(targetRoomId).get();
  const room = roomRes.data;

  if (!room) {
    return { success: false, error: '房间不存在' };
  }

  if (room.status !== 'playing') {
    return { success: false, error: '当前房间不可落子' };
  }

  const role = getPlayerRole(room, openId);
  if (!role) {
    return { success: false, error: '你不在当前房间中' };
  }

  if (room.currentTurn !== role) {
    return { success: false, error: '还没有轮到你落子' };
  }

  const nextBoard = normalizeBoard(room.board);
  if (nextBoard[targetRow][targetCol] !== EMPTY) {
    return { success: false, error: '当前位置已有棋子' };
  }

  const piece = roleToPiece(role);
  nextBoard[targetRow][targetCol] = piece;

  const hasWinner = checkWin(nextBoard, targetRow, targetCol, piece);
  const nextStatus = hasWinner ? 'finished' : 'playing';
  const winner = hasWinner ? role : null;
  const nextTurn = hasWinner ? role : nextRole(role);
  const lastMove = {
    row: targetRow,
    col: targetCol,
    piece,
    role,
  };

  await rooms.doc(targetRoomId).update({
    data: {
      board: _.set(nextBoard),
      lastMove: _.set(lastMove),
      currentTurn: nextTurn,
      winner,
      status: nextStatus,
      updatedAt: db.serverDate(),
    },
  });

  return {
    success: true,
    board: nextBoard,
    lastMove,
    currentTurn: nextTurn,
    winner,
    status: nextStatus,
  };
}

exports.main = async (event = {}) => {
  const { action, roomId, row, col } = event;
  const wxContext = cloud.getWXContext();
  const callerOpenId = wxContext.OPENID;

  try {
    switch (action) {
      case 'ping':
        return {
          success: true,
          version: ROOM_ACTION_VERSION,
          env: wxContext.ENV,
          time: Date.now(),
        };

      case 'createRoom': {
        const newRoomId = createUniqueRoomId();
        const roomData = {
          _id: newRoomId,
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
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        };

        await rooms.add({ data: roomData });

        return {
          success: true,
          roomId: newRoomId,
        };
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

      case 'joinRoom': {
        if (!roomId) {
          return { success: false, error: '房间号不能为空' };
        }

        const roomRes = await rooms.doc(roomId).get();
        const room = roomRes.data;

        if (!room) {
          return { success: false, error: '房间不存在' };
        }

        if (room.status !== 'waiting') {
          return { success: false, error: '房间不可加入' };
        }

        if (room.host && room.host.openId === callerOpenId) {
          return { success: false, error: '不能加入自己创建的房间' };
        }

        await rooms.doc(roomId).update({
          data: {
            guest: _.set({
              openId: callerOpenId,
              color: 'white',
            }),
            status: 'playing',
            updatedAt: db.serverDate(),
          },
        });

        return { success: true };
      }

      case 'placePiece':
        return placePieceForOpenId(roomId, row, col, callerOpenId);

      case 'updateRoom':
        return {
          success: false,
          error: 'updateRoom 已废弃，请使用 placePiece',
        };

      case 'leaveRoom': {
        if (!roomId) {
          return { success: false, error: '房间号不能为空' };
        }

        const roomRes = await rooms.doc(roomId).get();
        const room = roomRes.data;

        if (!room) {
          return { success: true };
        }

        const role = getPlayerRole(room, callerOpenId);
        if (!role) {
          return { success: true };
        }

        if (role === 'host') {
          await rooms.doc(roomId).remove();
          return { success: true };
        }

        await rooms.doc(roomId).update({
          data: {
            guest: null,
            status: 'waiting',
            currentTurn: 'host',
            board: _.set(createBoard()),
            lastMove: null,
            winner: null,
            updatedAt: db.serverDate(),
          },
        });

        return { success: true };
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
      error: err.message || String(err),
    };
  }
};
