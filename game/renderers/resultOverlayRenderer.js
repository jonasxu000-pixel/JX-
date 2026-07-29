const { COLORS } = require('../design/theme');
const { drawButton } = require('./buttonRenderer');
const { drawCard, drawPill, roundedRectPath } = require('./cardRenderer');
const { drawAvatar } = require('./avatarRenderer');
const { drawLabel } = require('./textRenderer');

const REVEAL_DELAY = 400;
const REVEAL_DURATION = 220;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function createResultReveal(runtime, requestRender) {
  const canvas = runtime && runtime.canvas;
  const requestFrame = canvas && typeof canvas.requestAnimationFrame === 'function'
    ? callback => canvas.requestAnimationFrame(callback)
    : null;
  const cancelFrame = canvas && typeof canvas.cancelAnimationFrame === 'function'
    ? frameId => canvas.cancelAnimationFrame(frameId)
    : null;
  let delayTimer = null;
  let frameId = null;
  let visible = false;
  let progress = 0;

  function clearScheduled() {
    if (delayTimer) clearTimeout(delayTimer);
    delayTimer = null;
    if (frameId !== null && cancelFrame) cancelFrame(frameId);
    frameId = null;
  }

  function finishImmediately() {
    visible = true;
    progress = 1;
    requestRender();
  }

  function startAnimation() {
    visible = true;
    progress = 0;
    if (!requestFrame) {
      finishImmediately();
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      progress = clamp((Date.now() - startedAt) / REVEAL_DURATION, 0, 1);
      requestRender();
      if (progress < 1) {
        frameId = requestFrame(tick);
      } else {
        frameId = null;
      }
    };
    frameId = requestFrame(tick);
  }

  return {
    show() {
      clearScheduled();
      visible = false;
      progress = 0;
      if (!requestFrame) {
        finishImmediately();
        return;
      }
      delayTimer = setTimeout(() => {
        delayTimer = null;
        startAnimation();
      }, REVEAL_DELAY);
    },
    hide() {
      clearScheduled();
      visible = false;
      progress = 0;
    },
    dispose() {
      this.hide();
    },
    isVisible() {
      return visible;
    },
    getProgress() {
      return progress;
    },
  };
}

function getResultOverlayLayout(width, height, safeTop = 0) {
  const cardWidth = Math.min(width - 32, 360);
  const cardHeight = Math.min(420, height - safeTop - 28);
  const contentHeight = height - safeTop;
  const centeredY = safeTop + (contentHeight - cardHeight) / 2;
  const cardY = Math.max(safeTop + 24, centeredY - 4);
  return {
    cardX: (width - cardWidth) / 2,
    cardY,
    cardWidth,
    cardHeight,
  };
}

function drawResultOverlay(ctx, input, options) {
  const {
    width,
    height,
    safeTop = 0,
    progress = 1,
    presentation,
    players = [],
    wxApi,
    onAvatarReady,
    primaryAction,
    secondaryAction,
  } = options;
  const eased = easeOutCubic(clamp(progress, 0, 1));
  const overlayAlpha = clamp(eased * 1.4, 0, 1);
  const layout = getResultOverlayLayout(width, height, safeTop);
  const centerX = width / 2;
  const centerY = layout.cardY + layout.cardHeight / 2;
  const scale = 0.94 + eased * 0.06;
  const interactive = progress >= 1;

  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = eased;
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);

  drawCard(ctx, {
    x: layout.cardX,
    y: layout.cardY,
    width: layout.cardWidth,
    height: layout.cardHeight,
    radius: 24,
    fill: COLORS.surface,
    stroke: COLORS.line,
  });
  drawSealBadge(ctx, {
    x: centerX,
    y: layout.cardY + 8,
    text: presentation.badge,
    fill: presentation.badgeFill,
  });

  drawLabel(ctx, presentation.title, centerX, layout.cardY + 70, 'center', {
    bold: true,
    size: 24,
    color: presentation.color,
  });
  drawLabel(ctx, presentation.subtitle, centerX, layout.cardY + 99, 'center', {
    size: 13,
    color: COLORS.inkMuted,
  });

  drawVersusPlayers(ctx, {
    cardX: layout.cardX,
    cardY: layout.cardY,
    cardWidth: layout.cardWidth,
    players,
    wxApi,
    onAvatarReady,
  });

  drawPill(ctx, {
    x: layout.cardX + 24,
    y: layout.cardY + 251,
    width: layout.cardWidth - 48,
    height: 36,
    text: presentation.note,
    fill: presentation.noteFill || COLORS.jadeSoft,
    color: presentation.noteColor || COLORS.jade,
  });

  drawButton(ctx, input, {
    x: layout.cardX + 24,
    y: layout.cardY + 303,
    width: layout.cardWidth - 48,
    height: 50,
    text: primaryAction.text,
    disabled: primaryAction.disabled,
    onTap: interactive ? primaryAction.onTap : null,
  });
  drawButton(ctx, input, {
    x: layout.cardX + 24,
    y: layout.cardY + 365,
    width: layout.cardWidth - 48,
    height: 42,
    text: secondaryAction.text,
    variant: 'secondary',
    disabled: secondaryAction.disabled,
    onTap: interactive ? secondaryAction.onTap : null,
  });

  ctx.restore();
}

function drawSealBadge(ctx, options) {
  const size = 64;
  const x = options.x - size / 2;
  const y = options.y - size / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(20, 35, 29, 0.2)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  roundedRectPath(ctx, x, y, size, size, 16);
  ctx.fillStyle = options.fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 2;
  roundedRectPath(ctx, x + 6, y + 6, size - 12, size - 12, 11);
  ctx.stroke();
  ctx.fillStyle = COLORS.white;
  ctx.font = '800 28px "STKaiti", "KaiTi", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(options.text, options.x, options.y + 1);
  ctx.restore();
}

function drawVersusPlayers(ctx, options) {
  const {
    cardX,
    cardY,
    cardWidth,
    players,
    wxApi,
    onAvatarReady,
  } = options;
  const gap = 40;
  const playerWidth = (cardWidth - 48 - gap) / 2;
  const leftX = cardX + 24;
  const rightX = leftX + playerWidth + gap;
  const y = cardY + 122;

  drawResultPlayer(ctx, {
    ...players[0],
    x: leftX,
    y,
    width: playerWidth,
    wxApi,
    onAvatarReady,
  });
  drawLabel(ctx, 'VS', cardX + cardWidth / 2, y + 48, 'center', {
    bold: true,
    size: 16,
    color: COLORS.gold,
  });
  drawResultPlayer(ctx, {
    ...players[1],
    x: rightX,
    y,
    width: playerWidth,
    wxApi,
    onAvatarReady,
  });
}

function drawResultPlayer(ctx, options) {
  const {
    x,
    y,
    width,
    player,
    nickname = '棋手',
    label = '',
    isWinner = false,
    isSelf = false,
    piece,
    wxApi,
    onAvatarReady,
  } = options;
  drawCard(ctx, {
    x,
    y,
    width,
    height: 108,
    radius: 16,
    fill: isWinner ? COLORS.jadeSoft : COLORS.surfaceMuted,
    stroke: isWinner ? '#7C9A8D' : COLORS.line,
    strokeWidth: isWinner ? 1.5 : 1,
    shadow: false,
  });

  if (player) {
    drawAvatar(
      ctx,
      wxApi,
      player,
      x + width / 2 - 21,
      y + 10,
      42,
      onAvatarReady,
    );
  } else {
    drawLargeStone(ctx, x + width / 2, y + 31, piece);
  }

  drawLabel(ctx, formatName(nickname), x + width / 2, y + 68, 'center', {
    bold: true,
    size: 13,
    color: COLORS.ink,
  });
  drawLabel(ctx, `${label}${isSelf ? ' · 我' : ''}`, x + width / 2, y + 91, 'center', {
    size: 11,
    color: isWinner ? COLORS.jade : COLORS.inkMuted,
  });
}

function drawLargeStone(ctx, x, y, piece) {
  const isBlack = piece === 'black';
  const gradient = ctx.createRadialGradient(x - 4, y - 5, 1, x, y, 20);
  if (isBlack) {
    gradient.addColorStop(0, '#565656');
    gradient.addColorStop(1, '#1A1A1A');
  } else {
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(1, '#E6E6E2');
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (!isBlack) {
    ctx.strokeStyle = '#D5D5D0';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function formatName(value) {
  const name = String(value || '棋手').trim();
  return name.length > 6 ? `${name.slice(0, 6)}…` : name;
}

module.exports = {
  REVEAL_DELAY,
  REVEAL_DURATION,
  createResultReveal,
  drawResultOverlay,
  getResultOverlayLayout,
};
