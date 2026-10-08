const { loadBackdrop } = require('./lobbyRenderer');
function drawSceneBackground(ctx, width, height, wx, onReady) {
  ctx.fillStyle = '#F7F4EE';
  ctx.fillRect(0, 0, width, height);
  const image = loadBackdrop(wx, onReady);
  if (image) {
    ctx.drawImage(image, 0, 0, width, height);
    ctx.fillStyle = 'rgba(249,244,231,.82)';
    ctx.fillRect(0, 0, width, height);
  }
}
module.exports = { drawSceneBackground };
