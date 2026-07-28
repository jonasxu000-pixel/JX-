const { spawnSync } = require('child_process');
const fs = require('fs');

const checks = [
  'scripts/verify-room-action.js',
  'scripts/verify-online-game-state.js',
  'scripts/verify-minigame-runtime.js',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function verifyJson(file) {
  JSON.parse(read(file));
  console.log(`json ok: ${file}`);
}

function verifySourceGuards() {
  const gameEntry = read('game.js');
  const runtimeSource = read('game/runtime.js');
  const joinSource = read('game/scenes/joinRoomScene.js');
  const shareSource = read('utils/share.js');
  const playerSessionSource = read('utils/playerSession.js');
  const profileSource = read('game/scenes/profileScene.js');
  const homeSource = read('game/scenes/homeScene.js');
  const onlineSource = read('game/scenes/onlineGameScene.js');
  const safeAreaSource = read('utils/safeArea.js');
  const cloudSource = read('cloudfunctions/roomAction/index.js');
  const permissionDoc = read('docs/DATABASE_PERMISSIONS.md');
  const gameConfig = JSON.parse(read('game.json'));
  const projectConfig = JSON.parse(read('project.config.json'));
  const ignored = projectConfig.packOptions.ignore.map(item => `${item.type}:${item.value}`);

  assert(projectConfig.compileType === 'game', 'project must compile as a Mini Game');
  assert(gameEntry.includes("require('./game/runtime')"), 'game.js must boot the Canvas runtime');
  assert(runtimeSource.includes('wxApi.createCanvas()'), 'runtime must create a Mini Game Canvas');
  assert(runtimeSource.includes('wxApi.onTouchStart'), 'runtime must register touch input');
  assert(joinSource.includes('autoFillFromClipboard'), 'join scene must automatically detect a copied room id');
  assert(!joinSource.includes('一键粘贴房间号'), 'join scene must not require a manual paste button');
  assert(joinSource.includes('if (digit) ctx.fillText'), 'join scene must render truly empty room-id slots');
  assert(!joinSource.includes("padEnd(6, '·')"), 'join scene must not use misleading password dots');
  assert(runtimeSource.includes('getSharedRoomId'), 'runtime must accept room ids from share entry parameters');
  assert(shareSource.includes('wxApi.shareAppMessage'), 'room sharing must use the Mini Game share API');
  assert(shareSource.includes('query: `roomId='), 'room sharing must include a deep-link room id');
  assert(runtimeSource.includes("manager.register('home'"), 'runtime must register the authenticated home scene');
  assert(playerSessionSource.includes('gomoku_player_session_v1'), 'WeChat login must persist a local player session');
  assert(profileSource.includes('createUserInfoButton'), 'profile must use the official user-authorized WeChat info button');
  assert(profileSource.includes('requirePrivacyAuthorize'), 'profile must prepare official privacy authorization');
  assert(profileSource.includes('chooseMedia'), 'profile must use the maintained media picker for album avatars');
  assert(profileSource.includes('chooseImage'), 'profile must retain a legacy album-picker fallback');
  assert(profileSource.includes('saveFile'), 'custom album avatar must be persisted in the Mini Game file sandbox');
  assert(cloudSource.includes('bothReady'), 'rematch must require both players to confirm');
  assert(cloudSource.includes('restartReady'), 'room state must persist rematch consent');
  assert(onlineSource.includes('placePiece'), 'online scene must use the cloud move action');
  assert(onlineSource.includes('restartRoom'), 'online scene must support another round');
  assert(onlineSource.includes('confirmSurrender'), 'online scene must confirm surrender before ending a round');
  assert(homeSource.includes('getContentTop'), 'home scene must respect the WeChat capsule safe area');
  assert(profileSource.includes('getContentTop'), 'profile scene must respect the WeChat capsule safe area');
  assert(onlineSource.includes('getContentTop'), 'online scene must respect the WeChat capsule safe area');
  assert(safeAreaSource.includes('getMenuButtonBoundingClientRect'),
    'safe area helper must derive layout from the live WeChat capsule');
  assert(gameConfig.officialPrivacyAuthorizationShowingGap === 10,
    'official privacy authorization retry interval must be configured');
  assert(cloudSource.includes('surrenderRoomForOpenId'), 'surrender must be adjudicated by the cloud action');
  assert(cloudSource.includes('ENABLE_ROOM_DIAGNOSTICS'), 'cloud diagnostics must be release-gated');
  assert(cloudSource.includes('isBoardFull(nextBoard)'), 'cloud action must finish full-board draws');
  assert(permissionDoc.includes('"write": false'), 'database permission guide must disable client writes');
  assert(projectConfig.setting.urlCheck === true, 'release build must keep URL validation enabled');
  assert(projectConfig.setting.minified === true, 'release build must enable JavaScript minification');
  assert(ignored.includes('folder:pages'), 'release package must exclude Mini Program pages');
  assert(ignored.includes('folder:components'), 'release package must exclude Mini Program components');
  assert(ignored.includes('folder:cloudfunctions'), 'release package must exclude cloud function source');
  assert(ignored.includes('file:app.json'), 'release package must exclude the Mini Program manifest');
  assert(ignored.includes('folder:.codex-preview'), 'release package must exclude local preview artifacts');

  console.log('mini game release source guards ok');
}

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.codex-preview', '.git', 'node_modules'].includes(entry.name)) return [];
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listJavaScriptFiles(path) : (entry.name.endsWith('.js') ? [path] : []);
  });
}

function verifyJavaScriptSyntax() {
  listJavaScriptFiles('.').forEach(file => {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(result.status === 0, `${file} syntax check failed:\n${result.stderr}`);
  });
  console.log('javascript syntax ok');
}

function runChecks() {
  checks.forEach(script => {
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      stdio: 'inherit',
    });
    assert(result.status === 0, `${script} failed`);
  });
}

function main() {
  [
    'game.json',
    'project.config.json',
    'cloudfunctions/roomAction/package.json',
  ].forEach(verifyJson);

  verifySourceGuards();
  verifyJavaScriptSyntax();
  runChecks();
  console.log('Mini Game automated release gate ok');
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
}
