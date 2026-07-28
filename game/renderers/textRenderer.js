function drawTitle(ctx, text, x, y) {
  ctx.fillStyle = '#22342d';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawSubtitle(ctx, text, x, y) {
  ctx.fillStyle = '#61736b';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawLabel(ctx, text, x, y, align = 'left') {
  ctx.fillStyle = '#31423b';
  ctx.font = '16px sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

module.exports = {
  drawTitle,
  drawSubtitle,
  drawLabel,
};
