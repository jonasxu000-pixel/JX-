const TURN_OPTIONS = [0, 30, 60, 120];
const UNDO_LIMIT = 2;
function normalize(value = {}) {
  return {
    version: 1,
    turnSeconds: TURN_OPTIONS.includes(value.turnSeconds) ? value.turnSeconds : 60,
    allowUndo: value.allowUndo !== false,
    undoLimit: UNDO_LIMIT,
  };
}
function fromSettings(settings = {}) {
  return normalize({ turnSeconds: settings.turnSeconds, allowUndo: settings.undoEnabled });
}
function summary(rules) {
  return `${rules.turnSeconds ? `每步 ${rules.turnSeconds} 秒 · 超时判负` : '不限时'} · ${rules.allowUndo ? '每方两次悔棋' : '不可悔棋'}`;
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
  normalize,
  fromSettings,
  summary,
  secondsLeft,
  format,
  createTicker,
};
