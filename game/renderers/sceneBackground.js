const { loadBackdrop } = require('./lobbyRenderer');
function drawSceneBackground(ctx, width, height, wx, onReady) {
  ctx.fillStyle = '#F7F4EE';
  ctx.fillRect(0, 0, width, height);
  const image = loadBackdrop(wx, onReady);
  if (image) {
    ctx.drawImage(image, 0, 0, width, height);
    ctx.fillStyle = 'rgba(249,244,231,.86)';
    ctx.fillRect(0, 0, width, height);
  }
  // soft jade wash at the top edge anchors the page header
  ctx.fillStyle = 'rgba(20, 56, 43, 0.05)';
  ctx.fillRect(0, 0, width, Math.min(96, height * 0.14));
}
module.exports = { drawSceneBackground };
