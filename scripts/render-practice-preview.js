// Local Canvas previews only. Supply an external @napi-rs/canvas module path;
// no rendering dependency is shipped in the Mini Game.
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts, Image } = require(process.argv[2] || '@napi-rs/canvas');
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

async function render(name, sceneName, params = {}, width = 375, height = 667, prepare) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const { runtime, wx } = createTestRuntime(width, height, ctx);
  const pending = [];
  wx.createImage = () => {
    const image = new Image();
    const descriptor = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
    Object.defineProperty(image, 'src', { set(value) {
      let resolve; const loaded = new Promise(done => { resolve = done; }); pending.push(loaded);
      const original = image.onload; image.onload = () => { if (original) original(); resolve(); }; image.onerror = () => resolve();
      descriptor.set.call(image, fs.readFileSync(path.resolve(value)));
    } });
    return image;
  };
  if (sceneName === 'growth') {
    // Explicitly synthetic preview fixture, never production user data.
    progress.record(wx, { id: 'preview-match', mode: 'ai', difficulty: 'normal', outcome: 'win', title: '进阶人机' });
    progress.record(wx, { id: 'preview-puzzle', mode: 'puzzle', puzzleId: 'p01', outcome: 'win', stars: 3, title: '横线收官' });
  }
  if (name === 'profile-sheet-375') {
    require('../utils/playerSession').savePlayer(wx, 'synthetic-preview-only', { nickName: '棋友' });
  }
  if(sceneName==='profile')require('../utils/playerSession').savePlayer(wx,'synthetic-profile',{nickName:'棋友'});
  if(['waitRoom','onlineGame'].includes(sceneName)){
    const fake={status:sceneName==='waitRoom'?'waiting':'playing',currentTurn:'host',host:{nickname:'棋友'},guest:sceneName==='onlineGame'?{nickname:'好友'}:null,board:board.createBoard(),rules:require('../utils/matchRules').normalize(),turnDeadline:sceneName==='onlineGame'?Date.now()+25000:0,moveCount:0,undoRequestsUsed:{host:0,guest:0}};
    runtime.manager.runtime.cloud={getRoom:()=>Promise.resolve(fake),syncRoom:()=>Promise.resolve({roomData:fake,serverNow:Date.now()}),watchRoom(){return {close(){}};}};
  }
  runtime.manager.go(sceneName, params);
  await Promise.all(pending);
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

async function main() {
const images = [
  await render('home-375', 'home'),
  await render('ai-375', 'aiGame', {}, 375, 667, scene => {
    [[7,7,1],[7,8,2],[6,7,1],[8,8,2],[6,6,1],[5,5,2]].forEach(([r,c,p]) => { scene.board[r][c] = p; });
    scene.lastMove = { row: 5, col: 5, piece: 2 };
  }),
  await render('puzzles-375', 'puzzleList'),
  await render('puzzle-game-375', 'puzzleGame', { puzzleId: 'c01' }),
  await render('settings-375', 'settings'),
  await render('result-375', 'aiGame', {}, 375, 667, scene => {
    [4,5,6,7,8].forEach(col => { scene.board[7][col] = board.BLACK; });
    scene.lastMove = { row: 7, col: 8, piece: 1 };
    scene.finishGame('你获胜');
  }),
];
await render('ai-preview-375', 'aiGame', {}, 375, 667, scene => {
  [[7,7,1],[7,8,2],[6,7,1],[8,8,2],[6,6,1],[5,5,2]].forEach(([r,c,p]) => { scene.board[r][c] = p; });
  scene.lastMove = { row: 5, col: 5, piece: 2 };
  scene.pendingMove = { row: 8, col: 6, piece: 1 };
});
await render('puzzles-master-375', 'puzzleList', { track: 'master' }, 375, 667);
await render('puzzle-master-375', 'puzzleGame', { puzzleId: 'm05' }, 375, 667, scene => {
  scene.toggleHint();
});
await render('puzzle-demo-375', 'puzzleGame', { puzzleId: 'm01' }, 375, 667, scene => {
  scene.enterDemoMode();
  scene.stepDemo(1);
  scene.stepDemo(1);
  scene.stepDemo(1);
});
await render('settings-320', 'settings', {}, 320, 568);
await render('home-320', 'home', {}, 320, 568);
await render('home-430', 'home', {}, 430, 932);
await render('join-room-375','joinRoom',{},375,667);
await render('profile-sheet-375','home',{},375,667,scene => { scene.sheet = 'player'; });
await render('rules-375','matchSetup',{mode:'friend'},375,667);
await render('rules-320','matchSetup',{mode:'friend'},320,568);
await render('rules-advanced-375','matchSetup',{mode:'friend'},375,667,scene=>{scene.advanced=true;scene.rules.ruleSet='renju';});
await render('rules-advanced-320','matchSetup',{mode:'friend'},320,568,scene=>{scene.advanced=true;scene.rules.ruleSet='renju';});
await render('local-375','localGame',{},375,667);
await render('growth-375','growth',{},375,667);
await render('profile-375','profile',{},375,667);
await render('wait-room-375','waitRoom',{roomId:'123456',viewId:'a'.repeat(36),role:'host'},375,667);
await render('online-375','onlineGame',{roomId:'123456',viewId:'a'.repeat(36),role:'host'},375,667);
await render('undo-375','localGame',{},375,667,scene=>{scene.board[7][7]=1;scene.lastMove={row:7,col:7,piece:1};scene.history=[{...scene.lastMove,remainingMs:45000}];scene.currentPlayer=2;scene.pendingUndo={by:1,requestedAt:Date.now(),expiresAt:Date.now()+15000};});
const sheet = createCanvas(375 * 3, 667 * 2);
const ctx = sheet.getContext('2d');
images.forEach((canvas, index) => { ctx.drawImage(canvas, (index % 3) * 375, Math.floor(index / 3) * 667); });
fs.writeFileSync(path.join(output, 'contact-sheet.png'), sheet.toBuffer('image/png'));
console.log(`Canvas previews written to ${output}`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
