const board = require('../../utils/board');
const { COLORS } = require('../design/theme');
const { roundedRectPath } = require('./cardRenderer');

function getBoardRect(width, top, maxSize = 420) {
  const size = Math.min(width - 32, 420, Math.max(180, maxSize));
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

  // Static wood feel: soft light-to-dark wash plus faint grain lines, no assets.
  if (typeof ctx.createLinearGradient === 'function') {
  const wash = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  wash.addColorStop(0, 'rgba(255, 240, 200, 0.28)');
  wash.addColorStop(0.55, 'rgba(255, 240, 200, 0)');
  wash.addColorStop(1, 'rgba(120, 80, 20, 0.16)');
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fillStyle = wash;
  ctx.fill();
  }
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();
  ctx.strokeStyle = 'rgba(140, 101, 39, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 0; g < 18; g += 1) {
    const gy = rect.y + ((g * 37 + 11) % 100) / 100 * rect.height;
    const sway = ((g % 5) - 2) * 2.2;
    ctx.moveTo(rect.x, gy);
    ctx.quadraticCurveTo(rect.x + rect.width / 2, gy + sway, rect.x + rect.width, gy - sway);
  }
  ctx.stroke();
  ctx.restore();

  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.strokeStyle = '#B98B43';
  ctx.lineWidth = 1;
  ctx.stroke();

  // A fine inner frame and coordinates keep the board readable on small screens.
  ctx.strokeStyle = 'rgba(255, 246, 219, 0.55)';
  roundedRectPath(ctx, rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, Math.max(3, radius - 2));
  ctx.stroke();
  ctx.fillStyle = '#795B2E';
  ctx.font = `${Math.max(7, Math.min(10, cellSize * 0.48))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < board.BOARD_SIZE; i += 1) {
    ctx.fillText(String.fromCharCode(65 + i), rect.x + padding + i * cellSize, rect.y + padding * 0.43);
    ctx.fillText(String(i + 1), rect.x + padding * 0.4, rect.y + padding + i * cellSize);
  }

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
    if (board.checkWin(boardState, lastMove.row, lastMove.col, lastMove.piece)) {
      const line = winningLine(boardState, lastMove);
      if (line) {
        ctx.beginPath();
        ctx.moveTo(rect.x + padding + line[0].col * cellSize, rect.y + padding + line[0].row * cellSize);
        ctx.lineTo(rect.x + padding + line[1].col * cellSize, rect.y + padding + line[1].row * cellSize);
        ctx.strokeStyle = '#EAC87C'; ctx.lineWidth = Math.max(3, cellSize * 0.14);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function winningLine(state, lastMove) {
  for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    const ends = [-1, 1].map(sign => {
      let row = lastMove.row; let col = lastMove.col;
      while (board.isValidPos(row + dr * sign, col + dc * sign) && state[row + dr * sign][col + dc * sign] === lastMove.piece) { row += dr * sign; col += dc * sign; }
      return { row, col };
    });
    if (Math.max(Math.abs(ends[0].row - ends[1].row), Math.abs(ends[0].col - ends[1].col)) >= 4) return ends;
  }
  return null;
}

function drawPiece(ctx, rect, row, col, piece) {
  const { padding, cellSize } = getConfig(rect);
  const x = rect.x + padding + col * cellSize;
  const y = rect.y + padding + row * cellSize;
  const radius = cellSize * 0.42;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const hx = x - radius * 0.35;
  const hy = y - radius * 0.38;
  const grad = ctx.createRadialGradient(hx, hy, radius * 0.08, x, y, radius);
  if (piece === board.BLACK) {
    grad.addColorStop(0, '#5E5E5A');
    grad.addColorStop(1, '#141414');
  } else {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(1, '#E4E2DA');
  }
  ctx.fillStyle = grad;
  // Dark warm shadow on both colors so white stones separate from the wood.
  ctx.shadowColor = piece === board.BLACK ? 'rgba(0, 0, 0, 0.4)' : 'rgba(58, 39, 14, 0.38)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (piece === board.WHITE) {
    ctx.strokeStyle = '#C9C5B8';
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
