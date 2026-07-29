const board = require('../../utils/board');
const { COLORS } = require('../design/theme');
const { roundedRectPath } = require('./cardRenderer');

function getBoardRect(width, top, maxSize = 420) {
  const size = Math.min(width - 32, 420, Math.max(220, maxSize));
  return {
    x: (width - size) / 2,
    y: top,
    width: size,
    height: size,
  };
}

function getConfig(rect) {
  const padding = rect.width * 0.08;
  const cellSize = (rect.width - padding * 2) / (board.BOARD_SIZE - 1);
  return { padding, cellSize };
}

function drawBoard(ctx, boardState, lastMove, rect) {
  const { padding, cellSize } = getConfig(rect);
  const radius = Math.min(8, rect.width * 0.025);

  ctx.save();
  ctx.shadowColor = 'rgba(58, 39, 14, 0.18)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fillStyle = COLORS.board;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#B98B43';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = COLORS.boardLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < board.BOARD_SIZE; i += 1) {
    const pos = padding + i * cellSize;
    ctx.moveTo(rect.x + padding, rect.y + pos);
    ctx.lineTo(rect.x + padding + (board.BOARD_SIZE - 1) * cellSize, rect.y + pos);
    ctx.moveTo(rect.x + pos, rect.y + padding);
    ctx.lineTo(rect.x + pos, rect.y + padding + (board.BOARD_SIZE - 1) * cellSize);
  }
  ctx.stroke();

  ctx.fillStyle = COLORS.boardLine;
  [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([row, col]) => {
    ctx.beginPath();
    ctx.arc(rect.x + padding + col * cellSize, rect.y + padding + row * cellSize, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  for (let row = 0; row < board.BOARD_SIZE; row += 1) {
    for (let col = 0; col < board.BOARD_SIZE; col += 1) {
      const piece = boardState[row][col];
      if (piece !== board.EMPTY) drawPiece(ctx, rect, row, col, piece);
    }
  }

  if (lastMove) {
    const x = rect.x + padding + lastMove.col * cellSize;
    const y = rect.y + padding + lastMove.row * cellSize;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.2, cellSize * 0.115), 0, Math.PI * 2);
    ctx.fillStyle = COLORS.danger;
    ctx.fill();
  }

  ctx.restore();
}

function drawPiece(ctx, rect, row, col, piece) {
  const { padding, cellSize } = getConfig(rect);
  const x = rect.x + padding + col * cellSize;
  const y = rect.y + padding + row * cellSize;
  const radius = cellSize * 0.42;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (piece === board.BLACK) {
    const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
    grad.addColorStop(0, '#555555');
    grad.addColorStop(1, '#1A1A1A');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
  } else {
    const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#FAFAFA');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
  }
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (piece === board.WHITE) {
    ctx.strokeStyle = '#D8D8D4';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function hitTest(x, y, rect) {
  if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) {
    return null;
  }
  const localX = x - rect.x;
  const localY = y - rect.y;
  return board.pxToGrid(localX, localY, getConfig(rect));
}

module.exports = {
  getBoardRect,
  drawBoard,
  hitTest,
};
