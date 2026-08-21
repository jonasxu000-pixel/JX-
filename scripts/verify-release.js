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
  const sceneManagerSource = read('game/core/sceneManager.js');
  const inputSource = read('game/core/inputManager.js');
  const buttonSource = read('game/renderers/buttonRenderer.js');
  const themeSource = read('game/design/theme.js');
  const boardSource = read('game/renderers/boardRenderer.js');
  const resultOverlaySource = read('game/renderers/resultOverlayRenderer.js');
  const joinSource = read('game/scenes/joinRoomScene.js');
  const createSource = read('game/scenes/createRoomScene.js');
  const shareSource = read('utils/share.js');
  const roomServiceSource = read('services/roomService.js');
  const playerSessionSource = read('utils/playerSession.js');
  const profileSource = read('game/scenes/profileScene.js');
  const homeSource = read('game/scenes/homeScene.js');
  const localSource = read('game/scenes/localGameScene.js');
  const onlineSource = read('game/scenes/onlineGameScene.js');
  const waitSource = read('game/scenes/waitRoomScene.js');
  const safeAreaSource = read('utils/safeArea.js');
  const cloudSource = read('cloudfunctions/roomAction/index.js');
  const permissionDoc = read('docs/DATABASE_PERMISSIONS.md');
  const gameConfig = JSON.parse(read('game.json'));
  const projectConfig = JSON.parse(read('project.config.json'));
  const ignored = projectConfig.packOptions.ignore.map(item => `${item.type}:${item.value}`);

  assert(projectConfig.compileType === 'game', 'project must compile as a Mini Game');
  assert(projectConfig.projectname === '棋遇五子棋',
    'developer-tool project name must use the filing release brand');
  assert(gameEntry.includes("require('./game/runtime')"), 'game.js must boot the Canvas runtime');
  assert(runtimeSource.includes('wxApi.createCanvas()'), 'runtime must create a Mini Game Canvas');
  assert(runtimeSource.includes('wxApi.onTouchStart'), 'runtime must register touch start input');
  assert(runtimeSource.includes('wxApi.onTouchMove'), 'runtime must register touch move input');
  assert(runtimeSource.includes('wxApi.onTouchEnd'), 'runtime must register touch end input');
  assert(runtimeSource.includes('wxApi.onTouchCancel'), 'runtime must register touch cancel input');
  assert(runtimeSource.includes('wxApi.onHide'), 'runtime must suspend scenes while backgrounded');
  assert(sceneManagerSource.includes('redrawAfterForeground'),
    'runtime must repaint Canvas after its foreground surface is restored');
  assert(inputSource.includes('handleTouchEnd'), 'buttons must activate on touch release');
  assert(inputSource.includes('handleTouchCancel'), 'buttons must support touch cancellation');
  assert(buttonSource.includes('input.isPressed'), 'buttons must render pressed feedback');
  assert(themeSource.includes("background: '#F7F4EE'"), 'release theme must use the paper background');
  assert(themeSource.includes("jade: '#14382B'"), 'release theme must use the dark jade primary');
  assert(themeSource.includes("danger: '#A83232'"), 'release theme must use the vermilion accent');
  assert(themeSource.includes("board: '#D2A866'"), 'release theme must use the matte board color');
  assert(boardSource.includes('COLORS.boardLine'), 'board must use the unified wood grid color');
  assert(resultOverlaySource.includes('drawResultOverlay'),
    'finished matches must use the reusable full-screen result overlay');
  assert(resultOverlaySource.includes('createResultReveal'),
    'result overlay must preserve the final board before its entrance animation');
  assert(localSource.includes('drawResultOverlay'),
    'local matches must use the shared full-screen result overlay');
  assert(onlineSource.includes('drawResultOverlay'),
    'friend matches must use the shared full-screen result overlay');
  assert(joinSource.includes('autoFillFromClipboard'), 'join scene must automatically detect a copied room id');
  assert(!joinSource.includes('一键粘贴房间号'), 'join scene must not require a manual paste button');
  assert(joinSource.includes('if (digit) ctx.fillText'), 'join scene must render truly empty room-id slots');
  assert(!joinSource.includes("padEnd(6, '·')"), 'join scene must not use misleading password dots');
  assert(runtimeSource.includes('getSharedRoomId'), 'runtime must accept room ids from share entry parameters');
  assert(shareSource.includes('wxApi.shareAppMessage'), 'room sharing must use the Mini Game share API');
  assert(shareSource.includes('query: `roomId='), 'room sharing must include a deep-link room id');
  assert(shareSource.includes('棋遇五子棋'), 'room sharing must use the current release brand');
  assert(homeSource.includes("'棋遇五子棋'"), 'home hero must use the current release brand');
  assert(createSource.includes("manager.go('waitRoom'"),
    'successful room creation must automatically enter the waiting room');
  assert(createSource.includes('cleanupAbandonedRoom'),
    'stale room creation must clean up its orphaned room');
  assert(!createSource.includes('进入房间等待'),
    'create scene must not require a redundant enter-waiting action');
  assert(!createSource.includes('copyRoomId'),
    'room number actions must live only in the waiting room');
  assert(roomServiceSource.includes('playerProfile'),
    'create and join room calls must publish the player display profile');
  assert(runtimeSource.includes("manager.register('home'"), 'runtime must register the authenticated home scene');
  assert(playerSessionSource.includes('gomoku_player_session_v1'), 'WeChat login must persist a local player session');
  assert(playerSessionSource.includes('getPublicPlayerProfile'),
    'room creation must publish a safe player display profile');
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
  assert(onlineSource.includes('renderPlayerCards'), 'online scene must render both versus player cards');
  assert(onlineSource.includes('drawFittedPlayerName'),
    'online player header must fit complete nicknames instead of fixed truncation');
  assert(waitSource.includes('startPolling'),
    'waiting host must have a polling fallback when realtime room watch stays silent');
  assert(onlineSource.includes("'⚑ 投降'"), 'surrender control must have a visible Chinese label');
  assert(homeSource.includes('getContentTop'), 'home scene must respect the WeChat capsule safe area');
  assert(profileSource.includes('getContentTop'), 'profile scene must respect the WeChat capsule safe area');
  assert(onlineSource.includes('getContentTop'), 'online scene must respect the WeChat capsule safe area');
  assert(safeAreaSource.includes('getMenuButtonBoundingClientRect'),
    'safe area helper must derive layout from the live WeChat capsule');
  assert(gameConfig.officialPrivacyAuthorizationShowingGap === 10,
    'official privacy authorization retry interval must be configured');
  assert(cloudSource.includes('surrenderRoomForOpenId'), 'surrender must be adjudicated by the cloud action');
  assert(cloudSource.includes('sanitizePlayerProfile'),
    'cloud room profiles must sanitize nicknames and avatar URLs');
  assert(cloudSource.includes('ENABLE_ROOM_DIAGNOSTICS'), 'cloud diagnostics must be release-gated');
  assert(cloudSource.includes('isBoardFull(nextBoard)'), 'cloud action must finish full-board draws');
  assert(permissionDoc.includes('"write": false'), 'database permission guide must disable client writes');
  assert(projectConfig.setting.urlCheck === true, 'release build must keep URL validation enabled');
  assert(projectConfig.setting.minified === true, 'release build must enable JavaScript minification');
  assert(ignored.includes('folder:cloudfunctions'), 'release package must exclude cloud function source');
  assert(ignored.includes('folder:.codex-preview'), 'release package must exclude local preview artifacts');
  ['app.js', 'app.json', 'app.wxss', 'sitemap.json', 'pages', 'components'].forEach(legacyPath => {
    assert(!fs.existsSync(legacyPath),
      `legacy Mini Program source must stay outside the Mini Game package: ${legacyPath}`);
  });

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
