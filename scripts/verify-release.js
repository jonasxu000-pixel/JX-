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
  const onlineSource = read('game/scenes/onlineGameScene.js');
  const cloudSource = read('cloudfunctions/roomAction/index.js');
  const permissionDoc = read('docs/DATABASE_PERMISSIONS.md');
  const projectConfig = JSON.parse(read('project.config.json'));
  const ignored = projectConfig.packOptions.ignore.map(item => `${item.type}:${item.value}`);

  assert(projectConfig.compileType === 'game', 'project must compile as a Mini Game');
  assert(gameEntry.includes("require('./game/runtime')"), 'game.js must boot the Canvas runtime');
  assert(runtimeSource.includes('wxApi.createCanvas()'), 'runtime must create a Mini Game Canvas');
  assert(runtimeSource.includes('wxApi.onTouchStart'), 'runtime must register touch input');
  assert(onlineSource.includes('placePiece'), 'online scene must use the cloud move action');
  assert(onlineSource.includes('restartRoom'), 'online scene must support another round');
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
