const board = require('../../utils/board');
const { COLORS } = require('../design/theme');

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

  ctx.save();
  ctx.shadowColor = 'rgba(31, 43, 39, 0.16)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#E7C77F';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  ctx.strokeStyle = '#8b7355';
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

  ctx.fillStyle = '#8b7355';
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
    ctx.arc(x, y, cellSize * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
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
    grad.addColorStop(1, '#111111');
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#cccccc');
    ctx.fillStyle = grad;
  }
  ctx.fill();
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
