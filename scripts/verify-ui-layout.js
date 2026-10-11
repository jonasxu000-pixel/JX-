// Existing production UI contracts; this is not a visual-upgrade acceptance test.
const assert = require('node:assert/strict');
const { getBoardRect, hitTest } = require('../game/renderers/boardRenderer');
const InputManager = require('../game/core/inputManager');
const { getContentTop } = require('../utils/safeArea');
const { COLORS } = require('../game/design/theme');

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => {
    const s = parseInt(value, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
  for (const capsuleBottom of [56, 72]) {
    const top = getContentTop({ getMenuButtonBoundingClientRect: () => ({ bottom: capsuleBottom }) });
    assert.equal(top, capsuleBottom + 12);
    const rect = getBoardRect(width, top, height - 34 - top);
    assert(rect.x >= 0 && rect.x + rect.width <= width);
    assert(rect.y >= capsuleBottom && rect.y + rect.height <= height - 34);
    const padding = rect.width * 0.08;
    const cell = (rect.width - 2 * padding) / 14;
    for (let row = 0; row < 15; row += 1) {
      for (let col = 0; col < 15; col += 1) {
        const position = hitTest(rect.x + padding + col * cell, rect.y + padding + row * cell, rect);
        assert(position, 'every intersection must map to a grid position');
        // Floating point rounding may produce -0 at the first intersection.
        // It addresses the same array index as 0 and is a valid board coordinate.
        assert(position.row === row && position.col === col, 'intersection must map to its row and column');
      }
    }
    assert.equal(hitTest(rect.x - 1, rect.y, rect), null);
    assert.equal(hitTest(rect.x, rect.y + rect.height + 1, rect), null);
  }
}

const input = new InputManager();
const rect = { x: 20, y: 100, width: 120, height: 44 };
let taps = 0;
const tap = () => { taps += 1; };
input.addHitArea(rect, tap);
input.handleTouchStart(40, 120);
assert.equal(taps, 0, 'touch start must not activate');
input.handleTouchEnd(40, 120).onTap();
assert.equal(taps, 1);
input.handleTouchStart(40, 120);
input.handleTouchCancel();
assert.equal(input.handleTouchEnd(40, 120).onTap, null);
input.handleTouchStart(40, 120);
input.handleTouchMove(200, 120);
assert.equal(input.handleTouchEnd(200, 120).onTap, null);
input.beginFrame();
input.addHitArea(rect, tap, true);
assert.equal(input.handleTouchStart(40, 120), false, 'disabled area must not capture');

for (const [foreground, background] of [[COLORS.ink, COLORS.surface], [COLORS.white, COLORS.jade]]) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  assert((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, 'primary text contrast must meet 4.5:1');
}
console.log('Existing UI contracts passed: four viewport board bounds, capsule clearance, 34px reserved bottom, grid round trips, touch release/cancel/disabled, primary contrast.');
console.log('Not covered: complete scene layout, overlays, auxiliary text contrast, visual upgrade or real WeChat rendering.');
