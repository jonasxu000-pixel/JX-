/**
 * 棋盘数据管理
 * 职责：棋盘状态、坐标转换、格子查询
 * 不依赖 UI 层
 */

const BOARD_SIZE = 15;

// 棋子类型
const EMPTY = 0;  // 空位
const BLACK = 1;  // 黑子
const WHITE = 2;  // 白子

/**
 * 创建空棋盘
 * @returns {number[][]} 15×15 二维数组，初始值全为 0
 */
function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

/**
 * 判断坐标是否在棋盘范围内
 */
function isValidPos(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/**
 * 将点击坐标 (px, py) 转换为棋盘格子索引 (row, col)
 * @param {number} px - 点击的 x 坐标（相对于 canvas）
 * @param {number} py - 点击的 y 坐标（相对于 canvas）
 * @param {object} config - 棋盘渲染配置
 * @param {number} config.padding - 棋盘边距
 * @param {number} config.cellSize - 格子间距
 * @returns {object|null} {row, col} 或 null（点击范围外）
 */
function pxToGrid(px, py, { padding, cellSize }) {
  const col = Math.round((px - padding) / cellSize);
  const row = Math.round((py - padding) / cellSize);
  return isValidPos(row, col) ? { row, col } : null;
}

/**
 * 获取棋子对应的中文名称
 */
function pieceName(piece) {
  if (piece === BLACK) return '黑棋';
  if (piece === WHITE) return '白棋';
  return '';
}

/**
 * 五连检测：从落子位置向四个方向检查是否形成连续5子
 * @param {number[][]} board - 棋盘状态
 * @param {number} row - 落子行
 * @param {number} col - 落子列
 * @param {number} piece - 棋子类型 (BLACK/WHITE)
 * @returns {boolean} true=获胜
 */
function checkWin(board, row, col, piece) {
  // 4个检测方向：[行增量, 列增量]
  const directions = [
    [0, 1],   // 水平
    [1, 0],   // 垂直
    [1, 1],   // 对角线
    [1, -1],  // 反对角线
  ];

  for (const [dr, dc] of directions) {
    let count = 1; // 当前落子算1个

    // 正向计数
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (isValidPos(r, c) && board[r][c] === piece) {
        count++;
      } else {
        break;
      }
    }

    // 反向计数
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (isValidPos(r, c) && board[r][c] === piece) {
        count++;
      } else {
        break;
      }
    }

    if (count >= 5) return true;
  }

  return false;
}

module.exports = {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  createBoard,
  isValidPos,
  pxToGrid,
  pieceName,
  checkWin,
};
