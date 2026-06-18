const { spawnSync } = require('child_process');
const fs = require('fs');

const checks = [
  'scripts/verify-room-action.js',
  'scripts/verify-online-game-page.js',
  'scripts/verify-online-game-state.js',
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
  const clientSource = [
    read('pages/room/create.js'),
    read('pages/room/create.wxml'),
    read('services/roomService.js'),
  ].join('\n');
  const cloudSource = read('cloudfunctions/roomAction/index.js');
  const permissionDoc = read('docs/DATABASE_PERMISSIONS.md');
  const projectConfig = JSON.parse(read('project.config.json'));
  const ignoredFolders = projectConfig.packOptions.ignore
    .filter(item => item.type === 'folder')
    .map(item => item.value);

  assert(!clientSource.includes('selfTest'), 'client must not expose self-test actions');
  assert(!clientSource.includes('云端自检'), 'client must not expose cloud diagnostic UI');
  assert(cloudSource.includes('ENABLE_ROOM_DIAGNOSTICS'), 'cloud diagnostics must be release-gated');
  assert(cloudSource.includes('isBoardFull(nextBoard)'), 'cloud action must finish full-board draws');
  assert(permissionDoc.includes('"write": false'), 'database permission guide must disable client writes');
  assert(projectConfig.setting.urlCheck === true, 'release build must keep URL validation enabled');
  assert(projectConfig.setting.minified === true, 'release build must enable JavaScript minification');
  assert(ignoredFolders.includes('.codex-preview'), 'release build must exclude local preview artifacts');

  console.log('release source guards ok');
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
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
    });
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
    'app.json',
    'project.config.json',
    'sitemap.json',
    'cloudfunctions/roomAction/package.json',
  ].forEach(verifyJson);

  verifySourceGuards();
  verifyJavaScriptSyntax();
  runChecks();
  console.log('V1.0 automated release gate ok');
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
}
