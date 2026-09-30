const { drawCard, roundedRectPath } = require('./cardRenderer');
const { drawIcon } = require('./iconRenderer');
const caches = new WeakMap();
const ATLAS = 'assets/lobby-sprites.png';
// Atlas bounds are verified by the native Canvas preview; no generated text is used.
const REGIONS = { jade: [20,241,598,241], gold: [636,241,599,241], cream: [21,818,599,236], friends: [659,713,557,447] };

function loadAtlas(wxApi, onReady) {
  if (!wxApi || !wxApi.createImage) return null;
  let entry = caches.get(wxApi);
  if (entry) {
    if (entry.ready) return entry.image;
    if (!entry.failed && onReady) entry.callbacks.add(onReady);
    return null;
  }
  const image = wxApi.createImage();
  entry = { image, ready: false, failed: false, callbacks: new Set(onReady ? [onReady] : []) };
  caches.set(wxApi, entry);
  image.onload = () => { entry.ready = true; entry.callbacks.forEach(callback => callback()); entry.callbacks.clear(); };
  image.onerror = () => { entry.failed = true; entry.callbacks.clear(); };
  image.src = ATLAS;
  return null;
}

function drawPlate(ctx, rect, kind, atlas) {
  if (!atlas) {
    drawCard(ctx, { ...rect, radius: 22, fill: { jade: '#227568', gold: '#F2C46F', cream: '#F7EEDC' }[kind], stroke: '#D6BC83' });
    return;
  }
  const [sx, sy, sw, sh] = REGIONS[kind];
  // Nine-slice retains the painted bevel when panels have different proportions.
  const edge = 54; const target = Math.min(24, rect.width / 4, rect.height / 4);
  const srcX = [sx, sx + edge, sx + sw - edge]; const srcY = [sy, sy + edge, sy + sh - edge];
  const srcW = [edge, sw - 2 * edge, edge]; const srcH = [edge, sh - 2 * edge, edge];
  const dstX = [rect.x, rect.x + target, rect.x + rect.width - target]; const dstY = [rect.y, rect.y + target, rect.y + rect.height - target];
  const dstW = [target, rect.width - 2 * target, target]; const dstH = [target, rect.height - 2 * target, target];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) ctx.drawImage(atlas, srcX[c], srcY[r], srcW[c], srcH[r], dstX[c], dstY[r], dstW[c], dstH[r]);
}
function drawFriends(ctx, atlas, rect) {
  if (!atlas) return;
  const [sx,sy,sw,sh] = REGIONS.friends;
  const size = Math.min(rect.width / sw, rect.height / sh);
  ctx.drawImage(atlas, sx, sy, sw, sh, rect.x + (rect.width - sw * size) / 2, rect.y + (rect.height - sh * size) / 2, sw * size, sh * size);
}
function drawIconButton(ctx, input, rect, icon, onTap, color = '#32675C') {
  const pressed = input.isPressed(rect);
  drawCard(ctx, { ...rect, radius: rect.height / 2, fill: pressed ? '#E1D2B9' : '#F6ECDC', stroke: '#DBCAAC', shadow: false });
  drawIcon(ctx, icon, rect.x + (rect.width - 23) / 2, rect.y + (rect.height - 23) / 2, 23, color);
  input.addHitArea(rect, onTap);
}
function pressOverlay(ctx, input, rect) {
  if (!input.isPressed(rect)) return;
  ctx.save(); roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 22);
  ctx.fillStyle = 'rgba(34,52,41,.12)'; ctx.fill(); ctx.restore();
}
module.exports = { loadAtlas, drawPlate, drawFriends, drawIconButton, pressOverlay };
