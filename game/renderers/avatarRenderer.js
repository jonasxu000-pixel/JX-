const { COLORS } = require('../design/theme');

const imageCache = new Map();

function loadImage(wxApi, url, onReady) {
  if (!url || !wxApi || typeof wxApi.createImage !== 'function') return null;
  const cached = imageCache.get(url);
  if (cached && cached.ready) return cached.image;
  if (cached) { if (onReady) cached.callbacks.add(onReady); return null; }

  const image = wxApi.createImage();
  const entry = { image, ready: false, callbacks: new Set(onReady ? [onReady] : []) };
  imageCache.set(url, entry);
  image.onload = () => {
    entry.ready = true;
    entry.callbacks.forEach(callback => callback()); entry.callbacks.clear();
  };
  image.onerror = () => imageCache.delete(url);
  image.src = url;
  return null;
}

function drawAvatar(ctx, wxApi, player, x, y, size, onReady) {
  const mode = (player && player.avatarMode) || 'jade';
  const avatarUrl = mode === 'custom'
    ? (player && player.customAvatarPath)
    : (player && player.wechatAvatarUrl);
  const image = (mode === 'wechat' || mode === 'custom')
    ? loadImage(wxApi, avatarUrl, onReady)
    : null;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size / 2;

  ctx.save();
  if (image && ctx.clip && ctx.drawImage) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();
    drawAvatarBorder(ctx, centerX, centerY, radius);
    return;
  }

  const fill = COLORS.jade;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${Math.max(13, size * 0.38)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('棋', centerX, centerY);
  ctx.restore();
  drawAvatarBorder(ctx, centerX, centerY, radius);
}

function drawAvatarBorder(ctx, centerX, centerY, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

module.exports = {
  drawAvatar,
};
