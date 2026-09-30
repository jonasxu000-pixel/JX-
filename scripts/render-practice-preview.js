// Local Canvas previews only. Supply an external @napi-rs/canvas module path;
// no rendering dependency is shipped in the Mini Game.
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require(process.argv[2] || '@napi-rs/canvas');
const { createTestRuntime } = require('./practice-test-support');
const progress = require('../utils/progressStore');
const board = require('../utils/board');
const output = path.resolve(process.argv[3] || '.codex-preview/practice');
fs.mkdirSync(output, { recursive: true });
const font = 'C:/Windows/Fonts/msyh.ttc';
if (fs.existsSync(font)) {
  GlobalFonts.registerFromPath(font, 'Microsoft YaHei');
  GlobalFonts.registerFromPath(font, 'PingFang SC');
}

function render(name, sceneName, params = {}, width = 375, height = 667, prepare) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const { runtime, wx } = createTestRuntime(width, height, ctx);
  if (sceneName === 'growth') {
    // Explicitly synthetic preview fixture, never production user data.
    progress.record(wx, { id: 'preview-match', mode: 'ai', difficulty: 'normal', outcome: 'win', title: '进阶人机' });
    progress.record(wx, { id: 'preview-puzzle', mode: 'puzzle', puzzleId: 'p01', outcome: 'win', stars: 3, title: '横线收官' });
  }
  runtime.manager.go(sceneName, params);
  if (prepare) prepare(runtime.manager.current);
  runtime.manager.render();
  ctx.fillStyle = '#F7F4EE'; ctx.fillRect(0, 0, width, 58);
  ctx.fillStyle = '#18261F'; ctx.font = '600 12px "Microsoft YaHei"'; ctx.fillText('9:41', 20, 25);
  ctx.fillStyle = '#EAE7DE'; ctx.fillRect(width - 94, 25, 74, 30);
  ctx.fillStyle = '#18261F'; ctx.fillText('···    ○', width - 78, 44);
  fs.writeFileSync(path.join(output, `${name}.png`), canvas.toBuffer('image/png'));
  if (runtime.manager.current.onExit) runtime.manager.current.onExit();
  return canvas;
}

const images = [
  render('home-375', 'home'),
  render('ai-375', 'aiGame', {}, 375, 667, scene => {
    [[7,7,1],[7,8,2],[6,7,1],[8,8,2],[6,6,1],[5,5,2]].forEach(([r,c,p]) => { scene.board[r][c] = p; });
    scene.lastMove = { row: 5, col: 5, piece: 2 };
  }),
  render('puzzles-375', 'puzzleList'),
  render('puzzle-game-375', 'puzzleGame', { puzzleId: 'p01' }),
  render('growth-375', 'growth'),
  render('result-375', 'aiGame', {}, 375, 667, scene => {
    [4,5,6,7,8].forEach(col => { scene.board[7][col] = board.BLACK; });
    scene.lastMove = { row: 7, col: 8, piece: 1 };
    scene.finishGame('你获胜');
  }),
];
render('home-320', 'home', {}, 320, 568);
render('home-430', 'home', {}, 430, 932);
const sheet = createCanvas(375 * 3, 667 * 2);
const ctx = sheet.getContext('2d');
images.forEach((canvas, index) => { ctx.drawImage(canvas, (index % 3) * 375, Math.floor(index / 3) * 667); });
fs.writeFileSync(path.join(output, 'contact-sheet.png'), sheet.toBuffer('image/png'));
console.log(`Canvas previews written to ${output}`);
