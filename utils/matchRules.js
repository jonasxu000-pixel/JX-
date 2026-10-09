const TURN_OPTIONS = [0, 30, 60, 120];
const UNDO_LIMIT = 1;
const RULE_SETS = ['freestyle', 'exact', 'renju'];
const RULE_NAMES = { freestyle: '自由五子棋', exact: '恰好五子', renju: '连珠禁手' };
function normalize(value = {}) {
  if (value.version === 1)
    return {
      version: 1,
      turnSeconds: TURN_OPTIONS.includes(value.turnSeconds) ? value.turnSeconds : 60,
      allowUndo: value.allowUndo !== false,
      undoLimit: 2,
      ruleSet: 'freestyle',
      openingCenter: false,
      rematch: 'alternate',
      undoScope: 'round',
    };
  const undoLimit =
    value.allowUndo === false
      ? 0
      : [0, 1, 2, 3].includes(value.undoLimit)
        ? value.undoLimit
        : UNDO_LIMIT;
  return {
    version: 2,
    turnSeconds: TURN_OPTIONS.includes(value.turnSeconds) ? value.turnSeconds : 30,
    allowUndo: undoLimit > 0,
    undoLimit,
    undoScope: value.undoScope === 'round' ? 'round' : 'move',
    ruleSet: RULE_SETS.includes(value.ruleSet) ? value.ruleSet : 'freestyle',
    openingCenter: value.openingCenter === true,
    rematch: value.rematch === 'alternate' ? 'alternate' : 'loser',
  };
}
function fromSettings(settings = {}) {
  return normalize({
    turnSeconds: settings.turnSeconds,
    allowUndo: settings.undoEnabled,
    undoLimit: settings.undoLimit,
    ruleSet: settings.ruleSet,
    openingCenter: settings.openingCenter,
    rematch: settings.rematch,
    undoScope: settings.undoScope,
  });
}
function summary(rules) {
  return `${rules.turnSeconds ? `每步 ${rules.turnSeconds} 秒` : '不限时'} · ${rules.allowUndo ? `每方 ${rules.undoLimit} 次悔棋` : '不可悔棋'} · ${RULE_NAMES[rules.ruleSet] || RULE_NAMES.freestyle}`;
}
function secondsLeft(deadline, now = Date.now()) {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}
function format(seconds) {
  return seconds === null
    ? '不限时'
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function createTicker(update) {
  let timer = null;
  function tick() {
    timer = null;
    if (!update()) return;
    timer = setTimeout(tick, 1000);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  return {
    start() {
      this.stop();
      tick();
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
module.exports = {
  TURN_OPTIONS,
  UNDO_LIMIT,
  RULE_SETS,
  RULE_NAMES,
  normalize,
  fromSettings,
  summary,
  secondsLeft,
  format,
  createTicker,
};
