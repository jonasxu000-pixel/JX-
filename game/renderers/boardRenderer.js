const board = require('../../utils/board');
const gomokuRules = require('../../utils/gomokuRules');
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

function formatCoord(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function setDash(ctx, pattern) {
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash(pattern);
  }
}

function drawBoard(ctx, boardState, lastMove, rect, options = {}) {
  const { padding, cellSize } = getConfig(rect);
  const radius = Math.min(8, rect.width * 0.025);
  const pendingMove = options.pendingMove;
  const moveNumbers = options.moveNumbers;
  const ruleSet = options.ruleSet || 'freestyle';

  ctx.save();
  ctx.shadowColor = 'rgba(58, 39, 14, 0.22)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fillStyle = COLORS.board;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Static Kaya-wood depth: angled highlight, subtle grain, and 3px lower bevel inside rect.
  if (typeof ctx.createLinearGradient === 'function') {
    const wash = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    wash.addColorStop(0, 'rgba(255, 243, 210, 0.30)');
    wash.addColorStop(0.55, 'rgba(255, 240, 200, 0)');
    wash.addColorStop(1, 'rgba(116, 76, 18, 0.18)');
    roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
    ctx.fillStyle = wash;
    ctx.fill();
  }
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();
  ctx.fillStyle = '#9E7132';
  ctx.fillRect(rect.x, rect.y + rect.height - 3, rect.width, 3);
  ctx.strokeStyle = 'rgba(140, 101, 39, 0.075)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 0; g < 20; g += 1) {
    const gy = rect.y + ((g * 37 + 11) % 100) / 100 * rect.height;
    const sway = ((g % 5) - 2) * 2.2;
    ctx.moveTo(rect.x, gy);
    ctx.quadraticCurveTo(rect.x + rect.width / 2, gy + sway, rect.x + rect.width, gy - sway);
  }
  ctx.stroke();
  ctx.restore();

  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.strokeStyle = '#AD7E37';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Inner chamfer highlight and coordinate labels.
  ctx.strokeStyle = 'rgba(255, 248, 224, 0.6)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, Math.max(3, radius - 2));
  ctx.stroke();

  const coordSize = Math.max(7, Math.min(10, cellSize * 0.46));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < board.BOARD_SIZE; i += 1) {
    const colHighlighted = pendingMove && pendingMove.col === i;
    const rowHighlighted = pendingMove && pendingMove.row === i;
    const cx = rect.x + padding + i * cellSize;
    const cy = rect.y + padding + i * cellSize;
    if (colHighlighted) {
      roundedRectPath(ctx, cx - cellSize * 0.36, rect.y + padding * 0.14, cellSize * 0.72, padding * 0.58, 4);
      ctx.fillStyle = 'rgba(20, 56, 43, 0.14)';
      ctx.fill();
    }
    ctx.fillStyle = colHighlighted ? COLORS.jade : '#795B2E';
    ctx.font = `${colHighlighted ? '700 ' : ''}${coordSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(String.fromCharCode(65 + i), cx, rect.y + padding * 0.43);

    if (rowHighlighted) {
      roundedRectPath(ctx, rect.x + padding * 0.12, cy - cellSize * 0.34, padding * 0.56, cellSize * 0.68, 4);
      ctx.fillStyle = 'rgba(20, 56, 43, 0.14)';
      ctx.fill();
    }
    ctx.fillStyle = rowHighlighted ? COLORS.jade : '#795B2E';
    ctx.font = `${rowHighlighted ? '700 ' : ''}${coordSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(String(i + 1), rect.x + padding * 0.4, cy);
  }

  // Inner grid lines (0.9px) and outer frame (1.6px).
  const gridSpan = (board.BOARD_SIZE - 1) * cellSize;
  ctx.strokeStyle = COLORS.boardLine;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 1; i < board.BOARD_SIZE - 1; i += 1) {
    const pos = padding + i * cellSize;
    ctx.moveTo(rect.x + padding, rect.y + pos);
    ctx.lineTo(rect.x + padding + gridSpan, rect.y + pos);
    ctx.moveTo(rect.x + pos, rect.y + padding);
    ctx.lineTo(rect.x + pos, rect.y + padding + gridSpan);
  }
  ctx.stroke();

  ctx.lineWidth = 1.6;
  ctx.strokeRect(rect.x + padding, rect.y + padding, gridSpan, gridSpan);

  // Two-layer star points.
  [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([row, col]) => {
    const sx = rect.x + padding + col * cellSize;
    const sy = rect.y + padding + row * cellSize;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(140, 101, 39, 0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.boardLine;
    ctx.fill();
  });

  if (options.openingCenter && boardState.every(line => line.every(piece => piece === board.EMPTY))) {
    const tx = rect.x + padding + 7 * cellSize;
    const ty = rect.y + padding + 7 * cellSize;
    ctx.save();
    setDash(ctx, [3, 3]);
    ctx.beginPath();
    ctx.arc(tx, ty, cellSize * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20, 56, 43, 0.48)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    setDash(ctx, []);
    ctx.restore();
  }

  if (options.hintZone) {
    drawHintZone(ctx, rect, padding, cellSize, options.hintZone);
  }

  for (let row = 0; row < board.BOARD_SIZE; row += 1) {
    for (let col = 0; col < board.BOARD_SIZE; col += 1) {
      const piece = boardState[row][col];
      if (piece !== board.EMPTY) {
        const moveNo = getMoveNumber(moveNumbers, row, col);
        drawPiece(ctx, rect, row, col, piece, moveNo);
      }
    }
  }

  if (lastMove && board.isValidPos(lastMove.row, lastMove.col) && boardState[lastMove.row][lastMove.col] === lastMove.piece) {
    const x = rect.x + padding + lastMove.col * cellSize;
    const y = rect.y + padding + lastMove.row * cellSize;
    const hasNumber = Boolean(getMoveNumber(moveNumbers, lastMove.row, lastMove.col));
    if (hasNumber) {
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.danger;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, cellSize * 0.145), 0, Math.PI * 2);
      ctx.fillStyle = lastMove.piece === board.BLACK ? 'rgba(255, 248, 232, 0.86)' : 'rgba(168, 50, 50, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.2, cellSize * 0.105), 0, Math.PI * 2);
      ctx.fillStyle = COLORS.danger;
      ctx.fill();
    }

    if (options.showWinLine !== false) {
      const judgement = gomokuRules.adjudicate(boardState, lastMove.row, lastMove.col, lastMove.piece, ruleSet);
      if (judgement.win) {
        const line = winningLine(boardState, lastMove, ruleSet);
        if (line) {
          const x1 = rect.x + padding + line[0].col * cellSize;
          const y1 = rect.y + padding + line[0].row * cellSize;
          const x2 = rect.x + padding + line[1].col * cellSize;
          const y2 = rect.y + padding + line[1].row * cellSize;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = 'rgba(234, 200, 124, 0.42)';
          ctx.lineWidth = Math.max(5.5, cellSize * 0.26);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = '#EAC87C';
          ctx.lineWidth = Math.max(2.6, cellSize * 0.12);
          ctx.stroke();

          const dr = Math.sign(line[1].row - line[0].row);
          const dc = Math.sign(line[1].col - line[0].col);
          const steps = Math.max(Math.abs(line[1].row - line[0].row), Math.abs(line[1].col - line[0].col));
          for (let s = 0; s <= steps; s += 1) {
            const sx = rect.x + padding + (line[0].col + dc * s) * cellSize;
            const sy = rect.y + padding + (line[0].row + dr * s) * cellSize;
            ctx.beginPath();
            ctx.arc(sx, sy, cellSize * 0.45, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(234, 200, 124, 0.85)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
  }

  if (options.hintPoint) {
    drawHintPoint(ctx, rect, padding, cellSize, options.hintPoint);
  }

  if (
    pendingMove &&
    board.isValidPos(pendingMove.row, pendingMove.col) &&
    boardState[pendingMove.row][pendingMove.col] === board.EMPTY
  ) {
    drawPendingMove(ctx, rect, padding, cellSize, pendingMove);
  }

  ctx.restore();
}

function getMoveNumber(moveNumbers, row, col) {
  if (!moveNumbers) return null;
  const key = `${row}:${col}`;
  if (typeof moveNumbers.get === 'function') return moveNumbers.get(key) || null;
  return moveNumbers[key] || null;
}

function drawHintZone(ctx, rect, padding, cellSize, zone) {
  const x = rect.x + padding + (zone.minCol - 0.45) * cellSize;
  const y = rect.y + padding + (zone.minRow - 0.45) * cellSize;
  const width = (zone.maxCol - zone.minCol + 0.9) * cellSize;
  const height = (zone.maxRow - zone.minRow + 0.9) * cellSize;
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, 8);
  ctx.fillStyle = 'rgba(179, 131, 62, 0.14)';
  ctx.fill();
  setDash(ctx, [5, 4]);
  ctx.strokeStyle = '#B3833E';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  setDash(ctx, []);
  ctx.restore();
}

function drawHintPoint(ctx, rect, padding, cellSize, point) {
  if (!board.isValidPos(point.row, point.col)) return;
  const cx = rect.x + padding + point.col * cellSize;
  const cy = rect.y + padding + point.row * cellSize;
  const radius = cellSize * 0.47;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(217, 154, 38, 0.18)';
  ctx.fill();
  setDash(ctx, [4, 3]);
  ctx.strokeStyle = '#C9841A';
  ctx.lineWidth = 2;
  ctx.stroke();
  setDash(ctx, []);
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.55, cy);
  ctx.lineTo(cx + radius * 0.55, cy);
  ctx.moveTo(cx, cy - radius * 0.55);
  ctx.lineTo(cx, cy + radius * 0.55);
  ctx.strokeStyle = '#B36E12';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawPendingMove(ctx, rect, padding, cellSize, pendingMove) {
  const { row, col, piece } = pendingMove;
  const cx = rect.x + padding + col * cellSize;
  const cy = rect.y + padding + row * cellSize;
  const radius = cellSize * 0.42;
  const gridSpan = (board.BOARD_SIZE - 1) * cellSize;
  const isBlack = piece !== board.WHITE;
  const strokeColor = isBlack ? '#14382B' : '#8F6220';

  ctx.save();
  // Crosshair guide lines across the board grid.
  setDash(ctx, [4, 4]);
  ctx.strokeStyle = 'rgba(20, 56, 43, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x + padding, cy);
  ctx.lineTo(rect.x + padding + gridSpan, cy);
  ctx.moveTo(cx, rect.y + padding);
  ctx.lineTo(cx, rect.y + padding + gridSpan);
  ctx.stroke();

  // Translucent preview stone.
  ctx.save();
  ctx.globalAlpha = 0.56;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#1C221E' : '#FBF9F2';
  ctx.fill();
  ctx.restore();

  // Dashed ring around preview stone.
  setDash(ctx, [4, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  setDash(ctx, []);

  // Corner focus brackets around the cell.
  const b = cellSize * 0.5;
  const leg = Math.max(3, cellSize * 0.16);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    const px = cx + sx * b;
    const py = cy + sy * b;
    ctx.moveTo(px - sx * leg, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py - sy * leg);
  });
  ctx.stroke();

  // Floating coordinate confirmation pill.
  const badgeText = `${formatCoord(row, col)} · 再点落子`;
  const badgeHeight = 20;
  const badgeWidth = Math.min(rect.width - 12, 98);
  const badgeX = Math.max(rect.x + 6, Math.min(rect.x + rect.width - badgeWidth - 6, cx - badgeWidth / 2));
  const badgeY = row < 2 ? cy + radius + 6 : cy - radius - badgeHeight - 6;
  roundedRectPath(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 10);
  ctx.fillStyle = 'rgba(20, 56, 43, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#D8BA7A';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#FFF7E2';
  ctx.font = '700 10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
  ctx.restore();
}

function winningLine(state, lastMove, ruleSet = 'freestyle') {
  const exactOnly = ruleSet === 'exact' || (ruleSet === 'renju' && lastMove.piece === board.BLACK);
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const ends = [-1, 1].map(sign => {
      let row = lastMove.row; let col = lastMove.col;
      while (board.isValidPos(row + dr * sign, col + dc * sign) && state[row + dr * sign][col + dc * sign] === lastMove.piece) {
        row += dr * sign; col += dc * sign;
      }
      return { row, col };
    });
    const span = Math.max(Math.abs(ends[0].row - ends[1].row), Math.abs(ends[0].col - ends[1].col)) + 1;
    if (exactOnly ? span === 5 : span >= 5) return ends;
  }
  return null;
}

function drawPiece(ctx, rect, row, col, piece, moveNumber = null) {
  const { padding, cellSize } = getConfig(rect);
  const x = rect.x + padding + col * cellSize;
  const y = rect.y + padding + row * cellSize;
  const radius = cellSize * 0.42;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (typeof ctx.createRadialGradient === 'function') {
    const hx = x - radius * 0.34;
    const hy = y - radius * 0.36;
    const grad = ctx.createRadialGradient(hx, hy, radius * 0.06, x, y, radius);
    if (piece === board.BLACK) {
      grad.addColorStop(0, '#686A63');
      grad.addColorStop(0.35, '#2C2E2C');
      grad.addColorStop(1, '#111212');
    } else {
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.55, '#F5F1E6');
      grad.addColorStop(1, '#DFD8C8');
    }
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = piece === board.BLACK ? '#1D201E' : '#F6F3EA';
  }
  ctx.shadowColor = piece === board.BLACK ? 'rgba(0, 0, 0, 0.42)' : 'rgba(58, 39, 14, 0.36)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  if (piece === board.BLACK) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.72, Math.PI * 1.12, Math.PI * 1.56);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = Math.max(1, radius * 0.1);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius * 0.84, Math.PI * 0.1, Math.PI * 0.42);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#C4BCA9';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (moveNumber) {
    ctx.fillStyle = piece === board.BLACK ? '#F8F4E8' : '#1E2D24';
    ctx.font = `700 ${Math.max(8, Math.round(cellSize * 0.4))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(moveNumber), x, y + 0.5);
  }
  ctx.restore();
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
  formatCoord,
};
