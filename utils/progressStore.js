const KEY = 'qiyu_growth_v1';
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const TITLES = ['初识棋局', '落子有章', '攻守兼备', '棋路渐深', '从容对弈', '棋遇高手'];
const THRESHOLDS = [0, 40, 100, 200, 350, 550];
const cache = new WeakMap();

function empty() {
  return {
    version: 1,
    xp: 0,
    ai: {},
    puzzles: {},
    history: [],
    receipts: [],
    settings: {
      sound: true,
      music: false,
      motion: true,
      vibration: false,
      confirmMove: true,
      difficulty: 'normal',
      turnSeconds: 30,
      undoEnabled: true,
      undoLimit: 1,
      ruleSet: 'freestyle',
      openingCenter: false,
      rematch: 'loser',
      undoScope: 'move',
      rulePresetVersion: 2,
    },
  };
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10000000) : 0;
}

function read(wxApi) {
  let source = wxApi && cache.get(wxApi);
  if (!source) {
    try {
      source = wxApi && wxApi.getStorageSync && wxApi.getStorageSync(KEY);
    } catch (_) {
      /* Use this session's cache. */
    }
  }
  if (!source || source.version !== 1) source = (wxApi && cache.get(wxApi)) || empty();
  const data = empty();
  data.xp = count(source.xp);
  DIFFICULTIES.forEach((id) => {
    const stats = (source.ai && source.ai[id]) || {};
    data.ai[id] = { win: count(stats.win), loss: count(stats.loss), draw: count(stats.draw) };
  });
  Object.keys(source.puzzles || {})
    .slice(0, 100)
    .forEach((id) => {
      const stars = count(source.puzzles[id]);
      if (stars > 0) data.puzzles[id] = Math.min(3, stars);
    });
  data.history = Array.isArray(source.history)
    ? source.history.filter((item) => item && typeof item.id === 'string').slice(0, 20)
    : [];
  data.receipts = Array.isArray(source.receipts)
    ? source.receipts.filter((id) => typeof id === 'string').slice(0, 40)
    : [];
  data.settings.sound = !(source.settings && source.settings.sound === false);
  data.settings.vibration = Boolean(source.settings && source.settings.vibration === true);
  data.settings.music = Boolean(source.settings && source.settings.music === true);
  data.settings.motion = !(source.settings && source.settings.motion === false);
  data.settings.confirmMove = !(source.settings && source.settings.confirmMove === false);
  if (source.settings && source.settings.rulePresetVersion === 2) {
    const preset = require('./matchRules').fromSettings(source.settings);
    Object.assign(data.settings, {
      turnSeconds: preset.turnSeconds,
      undoEnabled: preset.allowUndo,
      undoLimit: preset.undoLimit,
      ruleSet: preset.ruleSet,
      openingCenter: preset.openingCenter,
      rematch: preset.rematch,
      undoScope: preset.undoScope,
    });
  }
  data.settings.difficulty =
    source.settings && DIFFICULTIES.includes(source.settings.difficulty)
      ? source.settings.difficulty
      : 'normal';
  return data;
}

function write(wxApi, data) {
  if (wxApi) cache.set(wxApi, JSON.parse(JSON.stringify(data)));
  try {
    if (!wxApi || !wxApi.setStorageSync) return false;
    wxApi.setStorageSync(KEY, data);
    return true;
  } catch (_) {
    return false;
  }
}

function record(wxApi, result) {
  const data = read(wxApi);
  if (!result || !result.id || data.receipts.includes(result.id))
    return { data, earned: 0, saved: true };
  let earned = 0;
  if (
    result.mode === 'ai' &&
    DIFFICULTIES.includes(result.difficulty) &&
    ['win', 'loss', 'draw'].includes(result.outcome)
  ) {
    data.ai[result.difficulty][result.outcome] += 1;
    earned = result.outcome === 'win' ? { easy: 10, normal: 20, hard: 30 }[result.difficulty] : 5;
  } else if (
    result.mode === 'puzzle' &&
    result.outcome === 'win' &&
    typeof result.puzzleId === 'string'
  ) {
    if (!data.puzzles[result.puzzleId]) earned = 25;
    data.puzzles[result.puzzleId] = Math.max(
      data.puzzles[result.puzzleId] || 0,
      Math.min(3, Math.max(1, count(result.stars))),
    );
  } else {
    return { data, earned: 0, saved: true };
  }
  data.xp = Math.min(10000000, data.xp + earned);
  data.receipts.unshift(result.id);
  data.receipts = data.receipts.slice(0, 40);
  data.history.unshift({
    id: result.id,
    mode: result.mode,
    difficulty: result.difficulty || '',
    puzzleId: result.puzzleId || '',
    title: String(result.title || '').slice(0, 24),
    outcome: result.outcome,
    earned,
    at: Date.now(),
  });
  data.history = data.history.slice(0, 20);
  return { data, earned, saved: write(wxApi, data) };
}

function level(data) {
  let index = 0;
  while (index < THRESHOLDS.length - 1 && data.xp >= THRESHOLDS[index + 1]) index += 1;
  const start = THRESHOLDS[index];
  const next = THRESHOLDS[index + 1];
  return {
    index,
    title: TITLES[index],
    next,
    ratio: next ? (data.xp - start) / (next - start) : 1,
  };
}

function totals(data) {
  return DIFFICULTIES.reduce(
    (sum, id) => {
      const stats = data.ai[id];
      sum.played += stats.win + stats.loss + stats.draw;
      sum.wins += stats.win;
      return sum;
    },
    { played: 0, wins: 0, cleared: Object.keys(data.puzzles).length },
  );
}

function goals(data) {
  const sum = totals(data);
  return [
    { title: '初次交锋', note: '完成 1 局人机对战', value: sum.played, target: 1 },
    { title: '渐入佳境', note: '赢下 1 局进阶难度', value: data.ai.normal.win, target: 1 },
    { title: '破局练习', note: '解开 3 道残局', value: sum.cleared, target: 3 },
    { title: '迎难而上', note: '赢下 1 局挑战难度', value: data.ai.hard.win, target: 1 },
    {
      title: '入门毕业',
      note: '解开 12 道入门练习',
      value: Object.keys(data.puzzles).filter((id) => /^p\d\d$/.test(id)).length,
      target: 12,
    },
    {
      title: '攻杀入门',
      note: '解开 4 道烧脑挑战',
      value: Object.keys(data.puzzles).filter((id) => /^c\d\d$/.test(id)).length,
      target: 4,
    },
    {
      title: '长链破局',
      note: '解开全部 12 道烧脑挑战',
      value: Object.keys(data.puzzles).filter((id) => /^c\d\d$/.test(id)).length,
      target: 12,
    },
    {
      title: '绝杀初成',
      note: '解开 4 道大师残局',
      value: Object.keys(data.puzzles).filter((id) => /^m\d\d$/.test(id)).length,
      target: 4,
    },
    {
      title: '残局宗师',
      note: '解开全部 12 道大师残局',
      value: Object.keys(data.puzzles).filter((id) => /^m\d\d$/.test(id)).length,
      target: 12,
    },
  ].map((goal) => ({ ...goal, done: goal.value >= goal.target }));
}

function setSetting(wxApi, key, value) {
  const data = read(wxApi);
  if (
    ![
      'sound',
      'music',
      'motion',
      'vibration',
      'confirmMove',
      'difficulty',
      'turnSeconds',
      'undoEnabled',
      'undoLimit',
      'ruleSet',
      'openingCenter',
      'rematch',
      'undoScope',
    ].includes(key)
  )
    return false;
  if (key === 'turnSeconds' && ![0, 30, 60, 120].includes(value)) return false;
  if (key === 'difficulty' && !DIFFICULTIES.includes(value)) return false;
  if (key === 'undoLimit' && ![0, 1, 2, 3].includes(value)) return false;
  if (key === 'ruleSet' && !['freestyle', 'exact', 'renju'].includes(value)) return false;
  if (key === 'undoScope' && !['move', 'round'].includes(value)) return false;
  if (key === 'rematch' && !['loser', 'alternate'].includes(value)) return false;
  data.settings[key] = [
    'difficulty',
    'turnSeconds',
    'undoLimit',
    'ruleSet',
    'rematch',
    'undoScope',
  ].includes(key)
    ? value
    : Boolean(value);
  return write(wxApi, data);
}

function setRules(wxApi, value) {
  const data = read(wxApi),
    preset = require('./matchRules').normalize(value);
  Object.assign(data.settings, {
    rulePresetVersion: 2,
    turnSeconds: preset.turnSeconds,
    undoEnabled: preset.allowUndo,
    undoLimit: preset.undoLimit,
    ruleSet: preset.ruleSet,
    openingCenter: preset.openingCenter,
    rematch: preset.rematch,
    undoScope: preset.undoScope,
  });
  return write(wxApi, data);
}
module.exports = { KEY, read, record, level, totals, goals, setSetting, setRules };
