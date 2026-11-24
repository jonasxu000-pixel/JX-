const rules = require('./board');
const gomokuRules = require('./gomokuRules');

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const WINDOWS_5 = [];
const WINDOWS_6 = [];
for (let r = 0; r < 15; r += 1) {
  for (let c = 0; c < 15; c += 1) {
    for (const [dr, dc] of DIRS) {
      if (rules.isValidPos(r + 4 * dr, c + 4 * dc)) {
        WINDOWS_5.push({
          dr,
          dc,
          idxs: Array.from({ length: 5 }, (_, i) => (r + dr * i) * 15 + (c + dc * i)),
        });
      }
      if (rules.isValidPos(r + 5 * dr, c + 5 * dc)) {
        WINDOWS_6.push({
          dr,
          dc,
          idxs: Array.from({ length: 6 }, (_, i) => (r + dr * i) * 15 + (c + dc * i)),
        });
      }
    }
  }
}

function lineLengthFlat(cells, idx, dr, dc, piece) {
  const r0 = Math.floor(idx / 15);
  const c0 = idx % 15;
  let len = 1;
  for (const sign of [-1, 1]) {
    let rr = r0 + dr * sign;
    let cc = c0 + dc * sign;
    while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && cells[rr * 15 + cc] === piece) {
      len += 1;
      rr += dr * sign;
      cc += dc * sign;
    }
  }
  return len;
}

function toBoard2d(cells) {
  const b = [];
  for (let r = 0; r < 15; r += 1) {
    b.push(cells.slice(r * 15, r * 15 + 15));
  }
  return b;
}

function isLegalWinAt(cells, idx, piece, dr, dc, ruleSet) {
  if (cells[idx] !== 0) return false;
  if (ruleSet === 'freestyle' || (ruleSet === 'renju' && piece === 2)) return true;
  cells[idx] = piece;
  const exact = lineLengthFlat(cells, idx, dr, dc, piece) === 5;
  let win = exact;
  if (!win) {
    const r = Math.floor(idx / 15);
    const c = idx % 15;
    win = gomokuRules.adjudicate(toBoard2d(cells), r, c, piece, ruleSet).win;
  }
  cells[idx] = 0;
  return win;
}

function prefilterWindows(cells) {
  const w5 = [];
  for (let i = 0; i < WINDOWS_5.length; i += 1) {
    const win = WINDOWS_5[i];
    let has1 = false;
    let has2 = false;
    for (let k = 0; k < 5; k += 1) {
      const v = cells[win.idxs[k]];
      if (v === 1) has1 = true;
      else if (v === 2) has2 = true;
    }
    if (!(has1 && has2)) w5.push(win);
  }
  const w6 = [];
  for (let i = 0; i < WINDOWS_6.length; i += 1) {
    const win = WINDOWS_6[i];
    const idxs = win.idxs;
    if (cells[idxs[0]] !== 0 || cells[idxs[5]] !== 0) continue;
    let has1 = false;
    let has2 = false;
    for (let k = 1; k <= 4; k += 1) {
      const v = cells[idxs[k]];
      if (v === 1) has1 = true;
      else if (v === 2) has2 = true;
    }
    if (!(has1 && has2)) w6.push(win);
  }
  return { w5, w6 };
}

function analyzeThreatsFlat(cells, piece, ruleSet, includeThrees, activeW5 = WINDOWS_5, activeW6 = WINDOWS_6) {
  const opponent = piece === 1 ? 2 : 1;
  const wins = new Set();
  const fours = new Set();
  const threes = includeThrees ? new Set() : null;

  for (let i = 0; i < activeW5.length; i += 1) {
    const win = activeW5[i];
    const idxs = win.idxs;
    let own = 0;
    let e0 = -1;
    let e1 = -1;
    let emptyCount = 0;
    let blocked = false;
    for (let k = 0; k < 5; k += 1) {
      const idx = idxs[k];
      const v = cells[idx];
      if (v === opponent) {
        blocked = true;
        break;
      }
      if (v === piece) {
        own += 1;
      } else {
        if (emptyCount === 0) e0 = idx;
        else if (emptyCount === 1) e1 = idx;
        emptyCount += 1;
      }
    }
    if (blocked) continue;
    if (own === 4 && emptyCount === 1) {
      if (isLegalWinAt(cells, e0, piece, win.dr, win.dc, ruleSet)) {
        wins.add(e0);
      }
    } else if (own === 3 && emptyCount === 2) {
      fours.add(e0);
      fours.add(e1);
    }
  }

  if (includeThrees) {
    for (let i = 0; i < activeW6.length; i += 1) {
      const idxs = activeW6[i].idxs;
      if (cells[idxs[0]] !== 0 || cells[idxs[5]] !== 0) continue;
      let own = 0;
      let e0 = -1;
      let e1 = -1;
      let emptyCount = 0;
      let blocked = false;
      for (let k = 1; k <= 4; k += 1) {
        const idx = idxs[k];
        const v = cells[idx];
        if (v === opponent) {
          blocked = true;
          break;
        }
        if (v === piece) {
          own += 1;
        } else {
          if (emptyCount === 0) e0 = idx;
          else if (emptyCount === 1) e1 = idx;
          emptyCount += 1;
        }
      }
      if (blocked || own !== 2 || emptyCount !== 2) continue;
      threes.add(e0);
      threes.add(e1);
    }
  }

  return {
    wins: [...wins],
    fours: [...fours],
    threes: threes ? [...threes].filter(idx => !fours.has(idx) && !wins.has(idx)) : [],
  };
}

function analyzeThreats(board, piece, ruleSet = 'freestyle', includeThrees = false) {
  return analyzeThreatsFlat(board.flat(), piece, ruleSet, includeThrees);
}

function collectProofTouchCells(cells, proof, piece, ruleSet, seedIdx, activeW5, activeW6) {
  const opponent = piece === 1 ? 2 : 1;
  const result = new Set();
  const pointSet = new Set([seedIdx]);

  function walk(node) {
    if (!node) return;
    pointSet.add(node.move);
    if (typeof node.reply === 'number') pointSet.add(node.reply);
    if (Array.isArray(node.wins)) node.wins.forEach(w => pointSet.add(w));
    if (node.next) walk(node.next);
    if (node.branches) {
      Object.entries(node.branches).forEach(([defKey, sub]) => {
        pointSet.add(Number(defKey));
        walk(sub);
      });
    }
    if (node.defaultNext) walk(node.defaultNext);
  }
  walk(proof);

  for (let i = 0; i < activeW5.length; i += 1) {
    const idxs = activeW5[i].idxs;
    let blocked = false;
    let ownCount = 0;
    let inPointCount = 0;
    let hasPoint = false;
    for (let k = 0; k < 5; k += 1) {
      const idx = idxs[k];
      const v = cells[idx];
      if (v === opponent) {
        blocked = true;
        break;
      }
      const inP = pointSet.has(idx);
      if (inP) hasPoint = true;
      if (v === piece) ownCount += 1;
      else if (inP) inPointCount += 1;
    }
    if (!blocked && hasPoint && ownCount + inPointCount >= 4) {
      for (let k = 0; k < 5; k += 1) {
        if (cells[idxs[k]] === 0) result.add(idxs[k]);
      }
    }
  }

  for (let i = 0; i < activeW6.length; i += 1) {
    const idxs = activeW6[i].idxs;
    let blocked = false;
    let ownCount = 0;
    let hasSeed = false;
    for (let k = 0; k < 6; k += 1) {
      const idx = idxs[k];
      const v = cells[idx];
      if (v === opponent) {
        blocked = true;
        break;
      }
      if (idx === seedIdx) hasSeed = true;
      if (v === piece) ownCount += 1;
    }
    if (!blocked && hasSeed && ownCount >= 3) {
      for (let k = 0; k < 6; k += 1) {
        if (cells[idxs[k]] === 0) result.add(idxs[k]);
      }
    }
  }

  if (ruleSet === 'renju' && piece === 1) {
    for (const pIdx of pointSet) {
      const pr = Math.floor(pIdx / 15);
      const pc = pIdx % 15;
      for (const [dr, dc] of DIRS) {
        for (const step of [-1, 1]) {
          const rr = pr + dr * step;
          const cc = pc + dc * step;
          if (rr >= 0 && rr < 15 && cc >= 0 && cc < 15) {
            const nIdx = rr * 15 + cc;
            if (cells[nIdx] === 0) result.add(nIdx);
          }
        }
      }
    }
  }
  return result;
}

function collectDefenseCandidates(cells, piece, ruleSet, seedIdx, passProof, activeW5, activeW6) {
  const opponent = piece === 1 ? 2 : 1;
  const defenseSet = collectProofTouchCells(cells, passProof, piece, ruleSet, seedIdx, activeW5, activeW6);
  const direct = [...defenseSet];
  const counterThreats = analyzeThreatsFlat(cells, opponent, ruleSet, false, activeW5, activeW6);
  counterThreats.fours.forEach(idx => defenseSet.add(idx));
  counterThreats.wins.forEach(idx => defenseSet.add(idx));
  const extra = [...defenseSet].filter(idx => !direct.includes(idx));
  return { ordered: [...direct, ...extra], directSet: new Set(direct) };
}

function checkPlacement(cells, idx, piece, ruleSet) {
  if (cells[idx] !== 0) return { legal: false, win: false };
  cells[idx] = piece;
  if (ruleSet === 'freestyle' || (ruleSet === 'renju' && piece === 2)) {
    const win = DIRS.some(([dr, dc]) => lineLengthFlat(cells, idx, dr, dc, piece) >= 5);
    return { legal: true, win };
  }
  const r = Math.floor(idx / 15);
  const c = idx % 15;
  const judgement = gomokuRules.adjudicate(toBoard2d(cells), r, c, piece, ruleSet);
  if (judgement.foul) {
    cells[idx] = 0;
    return { legal: false, win: false };
  }
  return { legal: true, win: judgement.win };
}

function checkWinFast(cells, idx, piece, ruleSet) {
  if (ruleSet === 'freestyle' || (ruleSet === 'renju' && piece === 2)) {
    return DIRS.some(([dr, dc]) => lineLengthFlat(cells, idx, dr, dc, piece) >= 5);
  }
  const r = Math.floor(idx / 15);
  const c = idx % 15;
  return gomokuRules.adjudicate(toBoard2d(cells), r, c, piece, ruleSet).win;
}

function* search(cells, piece, remaining, allowThree, ruleSet, meter, activeW5, activeW6) {
  meter.nodes += 1;
  yield;
  if (meter.nodes > meter.maxNodes) {
    meter.limited = true;
    return null;
  }

  const own = analyzeThreatsFlat(cells, piece, ruleSet, allowThree && remaining >= 3, activeW5, activeW6);
  if (own.wins.length) {
    return { move: own.wins[0], length: 1, kind: 'win', reply: null, next: null };
  }
  if (remaining < 2) return null;

  const opponent = piece === 1 ? 2 : 1;
  const other = analyzeThreatsFlat(cells, opponent, ruleSet, false, activeW5, activeW6);
  if (other.wins.length > 1) return null;

  let candidates;
  if (other.wins.length === 1) {
    candidates = other.wins;
  } else {
    candidates = allowThree && remaining >= 3
      ? [...own.fours, ...own.threes]
      : own.fours;
  }

  for (let ci = 0; ci < candidates.length; ci += 1) {
    const idx = candidates[ci];
    const placed = checkPlacement(cells, idx, piece, ruleSet);
    if (!placed.legal) continue;
    if (placed.win) {
      cells[idx] = 0;
      return { move: idx, length: 1, kind: 'win', reply: null, next: null };
    }

    const follow = analyzeThreatsFlat(cells, piece, ruleSet, false, activeW5, activeW6);
    const counter = analyzeThreatsFlat(cells, opponent, ruleSet, false, activeW5, activeW6);

    if (counter.wins.length > 0) {
      cells[idx] = 0;
      continue;
    }

    if (follow.wins.length >= 2) {
      cells[idx] = 0;
      return { move: idx, length: 2, kind: 'four', wins: follow.wins, reply: null, next: null };
    }

    if (follow.wins.length === 1) {
      const reply = follow.wins[0];
      if (remaining > 2) {
        cells[reply] = opponent;
        const oppWon = checkWinFast(cells, reply, opponent, ruleSet);
        const next = oppWon
          ? null
          : yield* search(cells, piece, remaining - 1, allowThree, ruleSet, meter, activeW5, activeW6);
        cells[reply] = 0;
        if (next) {
          cells[idx] = 0;
          return { move: idx, length: next.length + 1, kind: 'four', reply, next };
        }
      }
      cells[idx] = 0;
      if (meter.limited) return null;
      yield;
      continue;
    }

    if (allowThree && remaining >= 3) {
      const passProof = yield* search(cells, piece, remaining - 1, false, ruleSet, meter, activeW5, activeW6);
      if (meter.limited) {
        cells[idx] = 0;
        return null;
      }
      if (passProof) {
        const { ordered, directSet } = collectDefenseCandidates(
          cells,
          piece,
          ruleSet,
          idx,
          passProof,
          activeW5,
          activeW6,
        );
        const branches = {};
        let refuted = false;
        let worstLength = 0;
        let primaryReply = null;
        for (let di = 0; di < ordered.length; di += 1) {
          const defIdx = ordered[di];
          if (cells[defIdx] !== 0) continue;
          cells[defIdx] = opponent;
          const oppWon = checkWinFast(cells, defIdx, opponent, ruleSet);
          const sub = oppWon
            ? null
            : yield* search(cells, piece, remaining - 1, allowThree, ruleSet, meter, activeW5, activeW6);
          cells[defIdx] = 0;
          if (!sub) {
            refuted = true;
            break;
          }
          branches[defIdx] = sub;
          worstLength = Math.max(worstLength, sub.length);
          if (primaryReply === null && directSet.has(defIdx)) {
            primaryReply = defIdx;
          }
          if (meter.limited) {
            refuted = true;
            break;
          }
        }
        if (!refuted && Object.keys(branches).length > 0) {
          if (primaryReply === null) primaryReply = Number(Object.keys(branches)[0]);
          cells[idx] = 0;
          return {
            move: idx,
            length: worstLength + 1,
            kind: 'three',
            reply: primaryReply,
            next: branches[primaryReply],
            branches,
            defaultNext: passProof,
          };
        }
      }
    }

    cells[idx] = 0;
    if (meter.limited) return null;
    yield;
  }
  return null;
}

function createTask(board, piece = 1, maxMoves = 7, options = {}) {
  const cells = board.flat();
  const { w5, w6 } = prefilterWindows(cells);
  const allowThree = Boolean(options.allowThree);
  const ruleSet = options.ruleSet || 'freestyle';
  const maxNodes = options.maxNodes || (allowThree ? 18000 : 12000);
  const meter = { nodes: 0, maxNodes, limited: false };
  let cancelled = false;
  let result = null;
  let done = false;

  function* iterative() {
    for (let depth = 1; depth <= maxMoves; depth += 1) {
      const proof = yield* search(cells, piece, depth, allowThree, ruleSet, meter, w5, w6);
      if (proof || meter.limited) return proof;
    }
    return null;
  }

  const iterator = iterative();
  return {
    step(budgetMs = 4) {
      if (cancelled) return { done: true, cancelled: true, proof: null };
      const started = Date.now();
      let count = 0;
      while (!done && count < 12 && Date.now() - started < budgetMs) {
        const tick = iterator.next();
        count += 1;
        if (tick.done) {
          done = true;
          result = tick.value;
        }
      }
      return { done, proof: result, nodes: meter.nodes, limited: meter.limited };
    },
    cancel() {
      cancelled = true;
    },
  };
}

function solve(board, piece = 1, maxMoves = 7, options = {}) {
  const task = createTask(board, piece, maxMoves, options);
  let result;
  do {
    result = task.step(1000);
  } while (!result.done);
  return result;
}

function findHint(board, maxMoves = 7, options = {}) {
  const ruleSet = options.ruleSet || 'freestyle';
  const vcf = solve(board, 1, maxMoves, {
    allowThree: false,
    ruleSet,
    maxNodes: options.maxNodes || 12000,
  });
  if (vcf.proof) {
    return {
      move: [Math.floor(vcf.proof.move / 15), vcf.proof.move % 15],
      length: vcf.proof.length,
      kind: vcf.proof.kind,
      proof: vcf.proof,
    };
  }
  if (options.allowThree !== false) {
    const vct = solve(board, 1, Math.min(maxMoves, 6), {
      allowThree: true,
      ruleSet,
      maxNodes: options.maxNodes || 18000,
    });
    if (vct.proof) {
      return {
        move: [Math.floor(vct.proof.move / 15), vct.proof.move % 15],
        length: vct.proof.length,
        kind: vct.proof.kind,
        proof: vct.proof,
      };
    }
  }
  return null;
}

module.exports = {
  analyzeThreats,
  createTask,
  solve,
  findHint,
};
