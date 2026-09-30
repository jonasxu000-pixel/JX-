const icons = require('../design/lucideIcons');

function drawIcon(ctx, name, x, y, size = 24, color = '#255C50') {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [type, data] of icons[name] || []) {
    ctx.beginPath();
    if (type === 'path') {
      let cursorX = 0; let cursorY = 0;
      for (const [command, ...args] of data) {
        if (command === 'M' || command === 'L') { ctx[command === 'M' ? 'moveTo' : 'lineTo'](...args); [cursorX,cursorY] = args; }
        if (command === 'H') { cursorX = args[0]; ctx.lineTo(cursorX, cursorY); }
        if (command === 'V') { cursorY = args[0]; ctx.lineTo(cursorX, cursorY); }
        if (command === 'C') { ctx.bezierCurveTo(...args); [cursorX,cursorY] = args.slice(-2); }
        if (command === 'Q') { ctx.quadraticCurveTo(...args); [cursorX,cursorY] = args.slice(-2); }
        if (command === 'Z') ctx.closePath();
      }
    } else if (type === 'circle') ctx.arc(+data.cx, +data.cy, +data.r, 0, Math.PI * 2);
    else if (type === 'rect') ctx.rect(+data.x, +data.y, +data.width, +data.height);
    else if (type === 'line') { ctx.moveTo(+data.x1, +data.y1); ctx.lineTo(+data.x2, +data.y2); }
    else if (type === 'polyline') {
      const values = data.points.trim().split(/[\s,]+/).map(Number);
      const pairs = [];
      for (let i = 0; i < values.length; i += 2) pairs.push([values[i], values[i + 1]]);
      pairs.forEach((pair, index) => index ? ctx.lineTo(...pair) : ctx.moveTo(...pair));
    }
    ctx.stroke();
  }
  ctx.restore();
}
module.exports = { drawIcon };
