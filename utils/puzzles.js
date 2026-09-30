const rules = require('./board');

// Original compact tactical exercises. All use free-style five-in-a-row.
// Coordinates are [row, column]; every advertised solution is checked in release tests.
const TUTORIALS = [
  { id: 'p01', title: '横线收官', chapter: 1, theme: '找出最后一子', moves: 1, black: [[7,4],[7,5],[7,6],[7,7]], white: [[7,3],[6,5],[8,6],[6,8]], solution: [7,8], hint: '沿着横向四颗黑子，找到没有被白子封住的一端。' },
  { id: 'p02', title: '纵向突破', chapter: 1, theme: '换一个方向观察', moves: 1, black: [[4,7],[5,7],[6,7],[7,7]], white: [[3,7],[5,6],[6,8],[8,5]], solution: [8,7], hint: '黑子的纵向连线只差最后一步。' },
  { id: 'p03', title: '斜线藏锋', chapter: 1, theme: '别漏掉斜线', moves: 1, black: [[4,4],[5,5],[6,6],[7,7]], white: [[3,3],[4,5],[6,7],[8,6]], solution: [8,8], hint: '从左上到右下，四颗黑子已经连在一起。' },
  { id: 'p04', title: '补上缺口', chapter: 1, theme: '连线不一定在两端', moves: 1, black: [[7,4],[7,5],[7,7],[7,8]], white: [[7,3],[7,9],[6,5],[8,8]], solution: [7,6], hint: '两端都被封住了，答案藏在黑子之间。' },
  { id: 'p05', title: '两端生机', chapter: 2, theme: '制造无法同时封堵的活四', moves: 2, black: [[7,6],[7,7],[7,8]], white: [[5,5],[6,9],[8,5]], solution: [7,5], hint: '把三连延长成两端开放的四连，对手只能挡住一端。' },
  { id: 'p06', title: '纵线双门', chapter: 2, theme: '让对手顾此失彼', moves: 2, black: [[6,7],[7,7],[8,7]], white: [[5,5],[6,9],[9,9]], solution: [5,7], hint: '纵向活三再延长一步，两端都是你的下一手胜点。' },
  { id: 'p07', title: '斜路通关', chapter: 2, theme: '斜向活四同样难防', moves: 2, black: [[6,6],[7,7],[8,8]], white: [[5,8],[6,9],[9,6]], solution: [5,5], hint: '留住斜线两端的空位，先形成活四。' },
  { id: 'p08', title: '断线重连', chapter: 2, theme: '补缺口，制造双胜点', moves: 2, black: [[7,5],[7,6],[7,8]], white: [[5,7],[6,9],[9,8]], solution: [7,7], hint: '填补中间空位，可以直接得到两端开放的四连。' },
  { id: 'p09', title: '十字交锋', chapter: 3, theme: '一子同时形成两条冲四', moves: 2, black: [[7,4],[7,5],[7,6],[4,7],[5,7],[6,7]], white: [[7,3],[3,7],[5,5],[8,6],[6,8],[9,9]], solution: [7,7], hint: '横线和纵线交汇处，能同时制造两个五连威胁。' },
  { id: 'p10', title: '斜横双锋', chapter: 3, theme: '看见两条线的共同落点', moves: 2, black: [[7,4],[7,5],[7,6],[4,4],[5,5],[6,6]], white: [[7,3],[3,3],[5,8],[8,6],[9,5],[4,8]], solution: [7,7], hint: '横向三子与斜向三子的延长线，交汇在同一个空位。' },
  { id: 'p11', title: '双斜破局', chapter: 3, theme: '同时威胁两条对角线', moves: 2, black: [[4,4],[5,5],[6,6],[4,10],[5,9],[6,8]], white: [[3,3],[3,11],[5,7],[8,7],[9,9],[9,5]], solution: [7,7], hint: '在两条斜线的交点落子，对手不能同时守住两个终点。' },
  { id: 'p12', title: '交点之外', chapter: 3, theme: '补缺口也能形成双杀', moves: 2, black: [[7,4],[7,5],[7,7],[4,6],[5,6],[6,6]], white: [[7,3],[3,6],[5,8],[8,5],[9,9],[4,8]], solution: [7,6], hint: '横线的缺口，也是纵线的延长点。先制造两处胜点。' },
];

const CHALLENGES = require('./challengePuzzles');
const PUZZLES = [...TUTORIALS, ...CHALLENGES];
const CHAPTERS = ['一子成局', '活四制胜', '双线破局', '连续攻杀', '转线推演', '长链制胜'];

function getPuzzle(id) { return PUZZLES.find(puzzle => puzzle.id === id) || null; }
function createPosition(puzzle) {
  const state = rules.createBoard();
  puzzle.black.forEach(([row, col]) => { state[row][col] = rules.BLACK; });
  puzzle.white.forEach(([row, col]) => { state[row][col] = rules.WHITE; });
  return state;
}
function isUnlocked(index, progress) {
  if (index < 0 || index >= PUZZLES.length) return false;
  // Each chapter can be entered directly. Experienced players can skip tutorials.
  return index % 4 === 0 || Boolean(progress.puzzles[PUZZLES[index - 1].id]) || Boolean(progress.puzzles[PUZZLES[index].id]);
}

module.exports = { PUZZLES, TUTORIALS, CHALLENGES, CHAPTERS, getPuzzle, createPosition, isUnlocked };
