const EMPTY_RULES = { version: 0, turnSeconds: 0, allowUndo: false, undoLimit: 0 };
function normalize(value) {
  if (value && value.version === 2) {
    const undoLimit =
      value.allowUndo === false ? 0 : [0, 1, 2, 3].includes(value.undoLimit) ? value.undoLimit : 1;
    return {
      version: 2,
      turnSeconds: [0, 30, 60, 120].includes(value.turnSeconds) ? value.turnSeconds : 30,
      allowUndo: undoLimit > 0,
      undoLimit,
      undoScope: value.undoScope === 'round' ? 'round' : 'move',
      ruleSet: ['freestyle', 'exact', 'renju'].includes(value.ruleSet)
        ? value.ruleSet
        : 'freestyle',
      openingCenter: value.openingCenter === true,
      rematch: value.rematch === 'alternate' ? 'alternate' : 'loser',
    };
  }
  return value && value.version === 1
    ? {
        version: 1,
        turnSeconds: [0, 30, 60, 120].includes(value.turnSeconds) ? value.turnSeconds : 60,
        allowUndo: value.allowUndo !== false,
        undoLimit: 2,
      }
    : EMPTY_RULES;
}
function deadline(room, now = Date.now()) {
  const seconds = normalize(room.rules).turnSeconds;
  return seconds ? now + seconds * 1000 : 0;
}
function expiration(room, now = Date.now()) {
  if (room.status !== 'playing') return null;
  if (normalize(room.rules).turnSeconds && room.turnDeadline && now >= room.turnDeadline)
    return {
      status: 'finished',
      winner: room.currentTurn === 'host' ? 'guest' : 'host',
      finishReason: 'timeout',
      timedOutBy: room.currentTurn,
      pendingUndo: null,
      turnDeadline: 0,
      restartReady: { host: false, guest: false },
    };
  if (room.pendingUndo && now >= room.pendingUndo.expiresAt) return { pendingUndo: null };
  return null;
}
module.exports = { normalize, deadline, expiration };
