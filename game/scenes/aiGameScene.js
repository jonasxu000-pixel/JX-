const board = require('../../utils/board');
const gomokuAi = require('../../utils/gomokuAi');
const gomokuRules = require('../../utils/gomokuRules');
const progressStore = require('../../utils/progressStore');
const matchStore = require('../../utils/localMatchStore');
const puzzles = require('../../utils/puzzles');
const puzzleDefense = require('../../utils/puzzleDefense');
const vctSearch = require('../../utils/vctSearch');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { createResultReveal, drawResultOverlay } = require('../renderers/resultOverlayRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');
const matchRules = require('../../utils/matchRules');
const { drawClock } = require('../renderers/ruleRenderer');

const AI_THINK_DELAY = 460;
const NAMES = { easy: '入门', normal: '进阶', hard: '挑战' };
let sequence = 0;

function matchId() {
  sequence += 1;
  return `local-${Date.now()}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDemoSteps(puzzle) {
  const steps = [];
  if (!puzzle) return steps;
  if (puzzle.proof) {
    let node = puzzle.proof;
    let num = 1;
    while (node) {
      const r = Math.floor(node.move / 15);
      const c = node.move % 15;
      const coord = boardRenderer.formatCoord(r, c);
      let comment;
      if (!node.next && !node.wins) {
        comment = `黑第 ${num} 手 (${coord})：五连绝杀！`;
      } else if (node.wins) {
        comment = `黑第 ${num} 手 (${coord})：双杀成局，下步必胜！`;
      } else if (node.kind === 'three') {
        comment = `黑第 ${num} 手 (${coord})：隐蔽活三先手，逼白应手`;
      } else {
        comment = `黑第 ${num} 手 (${coord})：冲四先手，迫白唯一防守`;
      }
      steps.push({ row: r, col: c, piece: board.BLACK, comment });
      if (node.wins && node.wins.length >= 2) {
        const w0 = node.wins[0];
        const w1 = node.wins[1];
        const wr = Math.floor(w0 / 15);
        const wc = w0 % 15;
        const fr = Math.floor(w1 / 15);
        const fc = w1 % 15;
        steps.push({
          row: wr,
          col: wc,
          piece: board.WHITE,
          comment: `白方应手 (${boardRenderer.formatCoord(wr, wc)})：只能阻挡一端`,
        });
        steps.push({
          row: fr,
          col: fc,
          piece: board.BLACK,
          comment: `黑第 ${num + 1} 手 (${boardRenderer.formatCoord(fr, fc)})：五连制胜！`,
        });
        break;
      }
      if (typeof node.reply === 'number' && node.next) {
        const rr = Math.floor(node.reply / 15);
        const rc = node.reply % 15;
        steps.push({
          row: rr,
          col: rc,
          piece: board.WHITE,
          comment: `白方应手 (${boardRenderer.formatCoord(rr, rc)})：${node.kind === 'three' ? '阻断活三路线' : '被迫封堵四连'}`,
        });
        node = node.next;
        num += 1;
      } else {
        break;
      }
    }
    return steps;
  }

  // Tutorial puzzle fallback (1-2 moves)
  const [sr, sc] = puzzle.solution;
  steps.push({
    row: sr,
    col: sc,
    piece: board.BLACK,
    comment: `黑第 1 手 (${boardRenderer.formatCoord(sr, sc)})：${puzzle.moves === 1 ? '一子成五制胜！' : '形成两端开放的活四！'}`,
  });
  if (puzzle.moves > 1) {
    const temp = puzzles.createPosition(puzzle);
    temp[sr][sc] = board.BLACK;
    const def = puzzleDefense.selectMove(temp, puzzle.moves - 1);
    if (def) {
      temp[def.row][def.col] = board.WHITE;
      steps.push({
        row: def.row,
        col: def.col,
        piece: board.WHITE,
        comment: `白方应手 (${boardRenderer.formatCoord(def.row, def.col)})：只能封堵一端`,
      });
      const wins = vctSearch.analyzeThreats(temp, board.BLACK, 'freestyle', false).wins;
      if (wins.length) {
        const wr = Math.floor(wins[0] / 15);
        const wc = wins[0] % 15;
        steps.push({
          row: wr,
          col: wc,
          piece: board.BLACK,
          comment: `黑第 2 手 (${boardRenderer.formatCoord(wr, wc)})：五连制胜！`,
        });
      }
    }
  }
  return steps;
}

class AiGameScene {
  constructor(runtime, params = {}) {
    this.runtime = runtime;
    const requestedPuzzle = puzzles.getPuzzle(params.puzzleId);
    const index = requestedPuzzle ? puzzles.PUZZLES.indexOf(requestedPuzzle) : -1;
    this.puzzle =
      index >= 0 && puzzles.isUnlocked(index, progressStore.read(runtime.wx))
        ? requestedPuzzle
        : null;
    this.mode = this.puzzle ? 'puzzle' : 'ai';
    this.difficulty = this.puzzle
      ? 'hard'
      : NAMES[params.difficulty]
        ? params.difficulty
        : progressStore.read(runtime.wx).settings.difficulty;
    this.board = this.puzzle ? puzzles.createPosition(this.puzzle) : board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.pendingMove = null;
    this.confirmMoveEnabled = progressStore.read(runtime.wx).settings.confirmMove !== false;
    this.gameOver = false;
    this.resultText = '';
    this.aiThinking = false;
    this.aiTimer = null;
    this.aiTask = null;
    this.searchGeneration = 0;
    this.active = true;
    this.boardRect = null;
    this.moves = 0;
    this.attempts = 0;
    this.usedHint = false;
    this.hintVisible = false;
    this.hintLevel = 0;
    this.hintData = null;
    this.usedStepBack = false;
    this.puzzleHistory = [];
    this.puzzleMoves = [];
    this.puzzleLostTempo = false;
    this.foulText = '';
    this.demoMode = false;
    this.demoSteps = [];
    this.demoIndex = 0;
    this.id = matchId();
    this.earned = 0;
    this.saved = true;
    this.rules = this.puzzle
      ? matchRules.normalize({ turnSeconds: 0, allowUndo: false })
      : matchRules.normalize(
          params.rules || matchRules.fromSettings(progressStore.read(runtime.wx).settings),
        );
    this.rules.ruleSet = 'freestyle';
    this.rules.openingCenter = false;
    this.rules.undoScope = 'round';
    this.deadline = 0;
    this.turnStartedAt = 0;
    this.undoLeft = this.rules.undoLimit;
    this.undoStack = [];
    this.finishReason = '';
    this.clock = matchRules.createTicker(() => {
      if (
        !this.active ||
        this.gameOver ||
        this.puzzle ||
        !this.deadline ||
        this.currentPlayer !== board.BLACK
      )
        return false;
      if (this.checkTimeout()) return false;
      runtime.manager.render();
      return true;
    });
    this.resultReveal = createResultReveal(runtime, () => runtime.manager.render());
    const resume = params.resume;
    if (
      resume &&
      resume.mode === this.mode &&
      (!this.puzzle || resume.puzzleId === this.puzzle.id)
    ) {
      const valid = matchStore.load(runtime.wx);
      if (valid && valid.id === resume.id) {
        this.board = valid.board;
        this.currentPlayer = valid.currentPlayer;
        this.lastMove =
          valid.lastMove && board.isValidPos(valid.lastMove.row, valid.lastMove.col)
            ? valid.lastMove
            : null;
        this.difficulty = this.puzzle ? 'hard' : valid.difficulty;
        this.id = valid.id;
        this.moves = Number.isSafeInteger(valid.moves) && valid.moves >= 0 ? valid.moves : 0;
        this.attempts =
          Number.isSafeInteger(valid.attempts) && valid.attempts >= 0 ? valid.attempts : 0;
        this.usedHint = Boolean(valid.usedHint);
        this.usedStepBack = Boolean(valid.usedStepBack);
        this.puzzleMoves = Array.isArray(valid.puzzleMoves) ? valid.puzzleMoves : [];
        this.puzzleHistory = Array.isArray(valid.puzzleHistory) ? valid.puzzleHistory : [];
        this.rules = valid.rules
          ? matchRules.normalize(valid.rules)
          : matchRules.normalize({ turnSeconds: 0, allowUndo: false });
        this.deadline = valid.deadline || 0;
        this.turnStartedAt = valid.turnStartedAt || (this.deadline ? this.deadline - this.rules.turnSeconds * 1000 : 0);
        this.undoLeft = Number.isInteger(valid.undoLeft) ? valid.undoLeft : 0;
        this.undoStack = valid.undoStack || [];
      }
    }
  }

  onEnter() {
    this.active = true;
    this.confirmMoveEnabled = progressStore.read(this.runtime.wx).settings.confirmMove !== false;
    if (this.demoMode) return;
    if (this.currentPlayer === board.BLACK) this.beginTurn();
    else this.scheduleAiMove();
  }
  onHide() {
    this.active = false;
    this.pendingMove = null;
    this.clock.stop();
    this.clearAiTimer();
    this.persist();
  }
  onResume() {
    this.active = true;
    this.confirmMoveEnabled = progressStore.read(this.runtime.wx).settings.confirmMove !== false;
    if (this.gameOver || this.demoMode) return;
    if (this.currentPlayer === board.BLACK) this.beginTurn();
    else this.scheduleAiMove();
  }
  onExit() {
    this.active = false;
    this.pendingMove = null;
    this.clock.stop();
    this.clearAiTimer();
    this.persist();
    this.resultReveal.dispose();
  }
  beginTurn() {
    if (this.puzzle || !this.rules.turnSeconds) return;
    if (!this.deadline) {
      this.turnStartedAt = Date.now();
      this.deadline = this.turnStartedAt + this.rules.turnSeconds * 1000;
    }
    this.clock.start();
  }
  checkTimeout() {
    if (!this.gameOver && !this.demoMode && this.deadline && Date.now() >= this.deadline) {
      this.finishReason = 'timeout';
      this.finishGame('你已超时');
      return true;
    }
    return false;
  }

  persist() {
    if (
      this.demoMode ||
      this.gameOver ||
      (!this.moves &&
        !this.lastMove &&
        this.undoLeft === this.rules.undoLimit &&
        (this.mode === 'ai' || (!this.usedHint && !this.attempts && !this.usedStepBack)))
    )
      return;
    this.saved = matchStore.save(this.runtime.wx, {
      mode: this.mode,
      puzzleId: this.puzzle ? this.puzzle.id : '',
      difficulty: this.difficulty,
      board: this.board,
      currentPlayer: this.currentPlayer,
      lastMove: this.lastMove,
      id: this.id,
      moves: this.moves,
      attempts: this.attempts,
      usedHint: this.usedHint,
      usedStepBack: this.usedStepBack,
      puzzleMoves: this.puzzle ? this.puzzleMoves : undefined,
      puzzleHistory: this.puzzle ? this.puzzleHistory : undefined,
      rules: this.rules,
      deadline: this.deadline,
      undoLeft: this.undoLeft,
      undoStack: this.undoStack,
      turnStartedAt: this.turnStartedAt,
    });
  }

  getLayout() {
    const safeTop = getContentTop(this.runtime.wx);
    const boardTop = safeTop + 124;
    return {
      safeTop,
      boardTop,
      maxBoardSize: Math.max(
        180,
        this.runtime.height - boardTop - 108 - Math.max(0, (this.runtime.bottomInset || 18) - 18),
      ),
    };
  }

  buildMoveNumberMap() {
    if (!this.puzzle || !this.puzzleMoves.length) return null;
    const map = {};
    this.puzzleMoves.forEach((pt, idx) => {
      map[`${pt.row}:${pt.col}`] = idx + 1;
    });
    return map;
  }

  render(ctx, input) {
    const { width, height, manager } = this.runtime;
    const layout = this.getLayout();
    const puzzleRuleSet = (this.puzzle && this.puzzle.ruleSet) || 'freestyle';
    this.boardRect = boardRenderer.getBoardRect(width, layout.boardTop, layout.maxBoardSize);

    drawLabel(
      ctx,
      this.demoMode ? `${this.puzzle.title} · 正解` : this.puzzle ? this.puzzle.title : '人机对战',
      20,
      layout.safeTop + 14,
      'left',
      { bold: true, size: 21, maxWidth: width - 160 },
    );
    drawLabel(
      ctx,
      this.demoMode
        ? `推演 ${this.demoIndex}/${this.demoSteps.length} 步`
        : this.puzzle
          ? `${this.puzzle.tag ? `${this.puzzle.tag} · ` : ''}${this.puzzle.moves} 手内执黑取胜`
          : '你执黑 · AI 执白',
      width - 20,
      layout.safeTop + 14,
      'right',
      {
        size: 11,
        color: this.puzzle && this.puzzle.ruleSet === 'renju' && !this.demoMode ? COLORS.danger : COLORS.inkMuted,
      },
    );

    if (!this.puzzle && !this.moves && !this.gameOver) {
      drawCard(ctx, {
        x: width - 122,
        y: layout.safeTop,
        width: 102,
        height: 34,
        fill: COLORS.goldSoft,
        shadow: false,
        radius: 12,
      });
      drawLabel(
        ctx,
        `规则 · ${this.rules.turnSeconds ? this.rules.turnSeconds + '秒' : '不限时'}`,
        width - 71,
        layout.safeTop + 17,
        'center',
        { size: 11, color: '#765622' },
      );
      input.addHitArea({ x: width - 122, y: layout.safeTop, width: 102, height: 38 }, () =>
        manager.go('matchSetup', { mode: 'ai', difficulty: this.difficulty, rules: this.rules }),
      );
    }

    if (this.puzzle) {
      drawCard(ctx, {
        x: 20,
        y: layout.safeTop + 36,
        width: width - 40,
        height: 44,
        fill: this.hintLevel > 0 ? '#FFF7E4' : COLORS.goldSoft,
        stroke: this.hintLevel > 0 ? '#C9A563' : COLORS.line,
        shadow: false,
      });
      if (this.demoMode) {
        drawLabel(
          ctx,
          '沿正着演示每一步攻防，按下方按钮逐步推演',
          34,
          layout.safeTop + 58,
          'left',
          { size: 11, bold: true, color: '#765622', maxWidth: width - 135 },
        );
        drawButton(ctx, input, {
          x: width - 98,
          y: layout.safeTop + 38,
          width: 76,
          height: 40,
          text: '返回关卡',
          fontSize: 12,
          variant: 'secondary',
          onTap: () => manager.go('puzzleList', { track: this.puzzle.tier || (this.puzzle.challenge ? 'challenge' : 'tutorial') }),
        });
      } else {
        this.renderPuzzleTopText(ctx, width, layout.safeTop);
        const hintBtnText = this.hintLevel === 0
          ? '提示'
          : (this.hintLevel === 1 && this.hintData && !this.hintData.lost ? '标落点' : '收起');
        drawButton(ctx, input, {
          x: width - 98,
          y: layout.safeTop + 38,
          width: 76,
          height: 40,
          text: hintBtnText,
          fontSize: 13,
          variant: 'gold',
          disabled: this.aiThinking || this.gameOver,
          onTap: () => this.toggleHint(),
        });
      }
    } else {
      const gap = 8;
      const w = (width - 40 - gap * 2) / 3;
      Object.keys(NAMES).forEach((difficulty, index) => {
        drawButton(ctx, input, {
          x: 20 + index * (w + gap),
          y: layout.safeTop + 38,
          width: w,
          height: 40,
          text: NAMES[difficulty],
          fontSize: 14,
          variant: this.difficulty === difficulty ? 'primary' : 'gold',
          disabled: this.gameOver,
          onTap: () => this.changeDifficulty(difficulty),
        });
      });
    }

    drawPill(ctx, {
      x: 20,
      y: layout.safeTop + 88,
      width: this.puzzle ? width - 40 : width - 144,
      height: 28,
      text: this.getStatusText(),
      fill: this.puzzleLostTempo && !this.gameOver && !this.demoMode
        ? '#FBE9DC'
        : this.aiThinking
          ? COLORS.surfaceMuted
          : COLORS.jadeSoft,
      color: this.puzzleLostTempo && !this.gameOver && !this.demoMode
        ? '#8A3A22'
        : this.aiThinking
          ? COLORS.inkMuted
          : COLORS.jade,
    });

    if (!this.puzzle) {
      if (this.currentPlayer === board.BLACK)
        drawClock(
          ctx,
          { x: width - 116, y: layout.safeTop + 87, width: 96, height: 30 },
          '',
          this.deadline,
          Date.now(),
          { side: this.currentPlayer === board.BLACK ? 'black' : 'white' },
        );
      else
        drawPill(ctx, {
          x: width - 116,
          y: layout.safeTop + 88,
          width: 96,
          height: 28,
          text: 'AI 思考中',
          fill: COLORS.goldSoft,
          color: '#79551D',
          stroke: '#D9BE86',
        });
    }

    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect, {
      pendingMove: !this.gameOver && !this.aiThinking && !this.demoMode ? this.pendingMove : null,
      moveNumbers: this.puzzle ? this.buildMoveNumberMap() : null,
      ruleSet: puzzleRuleSet,
      hintZone: !this.demoMode && this.hintLevel === 1 && this.hintData && !this.hintData.lost ? this.hintData.zone : null,
      hintPoint: !this.demoMode && this.hintLevel === 2 && this.hintData && !this.hintData.lost
        ? { row: this.hintData.move[0], col: this.hintData.move[1] }
        : null,
      showWinLine: (this.gameOver || this.demoMode) && this.finishReason !== 'timeout' && this.finishReason !== 'foul',
    });

    if (this.demoMode) {
      const buttonY = this.boardRect.y + this.boardRect.height + 16;
      const w = (width - 56) / 3;
      drawButton(ctx, input, {
        x: 20,
        y: buttonY,
        width: w,
        height: 44,
        text: '上一步',
        variant: 'secondary',
        fontSize: 13,
        disabled: this.demoIndex <= 0,
        onTap: () => this.stepDemo(-1),
      });
      drawButton(ctx, input, {
        x: 28 + w,
        y: buttonY,
        width: w,
        height: 44,
        text: '下一步',
        variant: 'primary',
        fontSize: 13,
        disabled: this.demoIndex >= this.demoSteps.length,
        onTap: () => this.stepDemo(1),
      });
      drawButton(ctx, input, {
        x: 36 + w * 2,
        y: buttonY,
        width: w,
        height: 44,
        text: '重新挑战',
        variant: 'gold',
        fontSize: 13,
        onTap: () => this.restart(),
      });
      drawLabel(
        ctx,
        '可逐手推演正解链路，再重新挑战拿高星',
        width / 2,
        buttonY + 66,
        'center',
        { size: 11, color: COLORS.inkMuted, maxWidth: width - 32 },
      );
    } else if (!this.gameOver) {
      const buttonY = this.boardRect.y + this.boardRect.height + 16;
      const w = (width - 56) / 3;
      if (this.puzzle) {
        drawButton(ctx, input, {
          x: 20,
          y: buttonY,
          width: w,
          height: 44,
          text: '退一步',
          variant: 'gold',
          fontSize: 13,
          disabled: this.aiThinking || !this.puzzleHistory.length,
          onTap: () => this.stepBack(),
        });
      } else {
        drawButton(ctx, input, {
          x: 20,
          y: buttonY,
          width: w,
          height: 44,
          text: this.rules.allowUndo ? `悔棋 ${this.undoLeft}` : '不可悔棋',
          variant: 'gold',
          fontSize: 12,
          disabled: !this.rules.allowUndo || !this.undoStack.length || !this.undoLeft,
          onTap: () => this.undo(),
        });
      }
      drawButton(ctx, input, {
        x: 28 + w,
        y: buttonY,
        width: w,
        height: 44,
        text: this.puzzle ? '重试本题' : '重开',
        fontSize: 13,
        variant: 'secondary',
        onTap: () => this.confirmRestart(),
      });
      drawButton(ctx, input, {
        x: 36 + w * 2,
        y: buttonY,
        width: w,
        height: 44,
        text: this.puzzle ? '返回关卡' : '返回大厅',
        fontSize: 13,
        variant: 'gold',
        onTap: () => manager.go(
          this.puzzle ? 'puzzleList' : 'home',
          this.puzzle ? { track: this.puzzle.tier || (this.puzzle.challenge ? 'challenge' : 'tutorial') } : {},
        ),
      });
      drawLabel(
        ctx,
        this.saved
          ? this.puzzle
            ? `剩余 ${Math.max(0, this.puzzle.moves - this.moves)} 步 · 首次通关 +25 修习值`
            : `${{ easy: '入门 · 宽松练习', normal: '进阶 · 攻防兼顾', hard: '挑战 · 预判回应' }[this.difficulty]} · 自动保存`
          : '本机存储暂不可用，本次进度未保存',
        width / 2,
        buttonY + 66,
        'center',
        { size: 11, color: this.saved ? COLORS.inkMuted : COLORS.danger, maxWidth: width - 32 },
      );
    }

    if (this.gameOver && this.resultReveal.isVisible()) {
      const next = this.puzzle && puzzles.PUZZLES[puzzles.PUZZLES.indexOf(this.puzzle) + 1];
      const won = this.resultText === '你获胜';
      drawResultOverlay(ctx, input, {
        width,
        height,
        safeTop: layout.safeTop,
        progress: this.resultReveal.getProgress(),
        presentation: this.getResultPresentation(),
        players: this.getResultPlayers(),
        primaryAction: {
          text: this.puzzle
            ? won && next
              ? '挑战下一题'
              : won
                ? '查看成长'
                : '再试一次'
            : '再来一局',
          onTap: () =>
            this.puzzle && won
              ? manager.go(next ? 'puzzleGame' : 'growth', next ? { puzzleId: next.id } : {})
              : this.restart(),
        },
        secondaryAction: {
          text: this.puzzle ? '返回关卡' : '我的成长',
          onTap: () => manager.go(
            this.puzzle ? 'puzzleList' : 'growth',
            this.puzzle ? { track: this.puzzle.tier || (this.puzzle.challenge ? 'challenge' : 'tutorial') } : {},
          ),
        },
        tertiaryAction: this.puzzle
          ? {
              text: '查看正解演示',
              onTap: () => this.enterDemoMode(),
            }
          : null,
      });
    }
  }

  renderPuzzleTopText(ctx, width, safeTop) {
    const maxW = width - 134;
    if (this.hintLevel === 0 || !this.hintData) {
      drawLabel(ctx, this.puzzle.theme, 34, safeTop + 58, 'left', {
        size: 12,
        bold: true,
        color: '#765622',
        maxWidth: maxW,
      });
      return;
    }
    let text = this.hintData.text || this.puzzle.hint;
    if (this.hintLevel === 2 && !this.hintData.lost && this.hintData.move) {
      const coord = boardRenderer.formatCoord(this.hintData.move[0], this.hintData.move[1]);
      text = `关键落点：${coord}（图中金色准星标注）`;
    } else if (!this.hintData.lost && this.hintLevel === 1) {
      text = `战术区：${text}`;
    }
    const splitAt = Math.max(14, Math.floor(maxW / 10));
    if (text.length <= splitAt) {
      drawLabel(ctx, text, 32, safeTop + 58, 'left', {
        size: 11,
        bold: this.hintData.lost || this.hintLevel === 2,
        color: this.hintData.lost ? COLORS.danger : '#765622',
        maxWidth: maxW,
      });
    } else {
      drawLabel(ctx, text.slice(0, splitAt), 32, safeTop + 50, 'left', {
        size: 10,
        bold: this.hintData.lost || this.hintLevel === 2,
        color: this.hintData.lost ? COLORS.danger : '#765622',
        maxWidth: maxW,
      });
      drawLabel(ctx, text.slice(splitAt), 32, safeTop + 66, 'left', {
        size: 10,
        color: this.hintData.lost ? COLORS.danger : '#765622',
        maxWidth: maxW,
      });
    }
  }

  getStatusText() {
    if (this.demoMode) {
      if (this.demoIndex === 0) return '点击「下一步」开始正解演示';
      const step = this.demoSteps[this.demoIndex - 1];
      return (step && step.comment) || '正解演示中';
    }
    if (this.resultText)
      return this.puzzle
        ? this.resultText === '你获胜'
          ? '破局成功'
          : this.finishReason === 'foul'
            ? this.resultText
            : '再想想这一步'
        : this.resultText;
    if (this.aiThinking) return this.puzzle ? '守方思考应手中…' : '棋遇 AI 思考中…';
    if (this.pendingMove) {
      return `已预选 ${boardRenderer.formatCoord(this.pendingMove.row, this.pendingMove.col)} · 再点落子`;
    }
    if (this.puzzle && this.puzzleLostTempo) {
      return '攻势已断，建议点「退一步」重算';
    }
    return this.puzzle
      ? `轮到你 · 还可落 ${Math.max(0, this.puzzle.moves - this.moves)} 子`
      : '轮到你落子（黑棋）';
  }

  handleTouch(x, y) {
    if (this.demoMode) return;
    if (this.checkTimeout()) return;
    if (
      this.gameOver ||
      this.aiThinking ||
      this.currentPlayer !== board.BLACK ||
      !this.boardRect
    )
      return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) {
      if (this.pendingMove) {
        this.pendingMove = null;
        this.runtime.manager.render();
      }
      return;
    }

    if (this.confirmMoveEnabled) {
      if (!this.pendingMove || this.pendingMove.row !== grid.row || this.pendingMove.col !== grid.col) {
        this.pendingMove = { row: grid.row, col: grid.col, piece: board.BLACK };
        if (this.runtime.feedback && this.runtime.feedback.select) this.runtime.feedback.select();
        this.runtime.manager.render();
        return;
      }
      this.pendingMove = null;
    }

    if (this.puzzle) {
      this.puzzleHistory.push({
        board: this.board.map(row => row.slice()),
        lastMove: this.lastMove,
        moves: this.moves,
        puzzleMoves: this.puzzleMoves.slice(),
      });
      this.hintLevel = 0;
      this.hintVisible = false;
      this.hintData = null;
      this.puzzleLostTempo = false;
    } else if (this.rules.allowUndo) {
      this.undoStack.push({
        board: this.board.map(row => row.slice()),
        lastMove: this.lastMove,
        moves: this.moves,
        remainingMs: this.deadline ? Math.max(0, this.deadline - Date.now()) : null,
      });
      this.undoStack = this.undoStack.slice(-this.rules.undoLimit);
    }

    this.moves += 1;
    if (this.puzzle) {
      this.puzzleMoves.push({ row: grid.row, col: grid.col });
    }
    this.placeMove(grid.row, grid.col, board.BLACK);
    if (this.finishAfterMove(grid.row, grid.col, board.BLACK, '你获胜')) return;
    if (this.puzzle && this.moves >= this.puzzle.moves) {
      this.finishGame('步数用尽');
      return;
    }
    this.currentPlayer = board.WHITE;
    this.deadline = 0;
    this.clock.stop();
    this.aiThinking = true;
    this.persist();
    this.runtime.manager.render();
    this.scheduleAiMove();
  }

  scheduleAiMove(delay = AI_THINK_DELAY) {
    if (!this.active || this.gameOver || this.demoMode || this.currentPlayer !== board.WHITE || this.aiTimer) return;
    this.aiThinking = true;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this.startAiSearch();
    }, delay);
  }
  startAiSearch() {
    if (!this.active || this.gameOver || this.demoMode || this.currentPlayer !== board.WHITE) return;
    const ruleSet = (this.puzzle && this.puzzle.ruleSet) || 'freestyle';
    this.aiTask =
      this.puzzle && this.puzzle.challenge
        ? puzzleDefense.createTask(this.board, this.puzzle.moves - this.moves, {
            ruleSet,
            vct: Boolean(this.puzzle.vct),
          })
        : gomokuAi.createMoveTask(this.board, board.WHITE, board.BLACK, {
            difficulty: this.difficulty,
          });
    const generation = this.searchGeneration;
    const tick = () => {
      this.aiTimer = null;
      if (!this.active || generation !== this.searchGeneration || !this.aiTask) return;
      const result = this.aiTask.step(4);
      if (result.done) {
        this.aiTask = null;
        this.performAiMove(result.move);
      } else this.aiTimer = setTimeout(tick, 4);
    };
    tick();
  }
  clearAiTimer() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
    if (this.aiTask) this.aiTask.cancel();
    this.aiTask = null;
    this.searchGeneration += 1;
  }
  performAiMove(selected) {
    this.clearAiTimer();
    if (!this.active || this.gameOver || this.demoMode || this.currentPlayer !== board.WHITE) return null;
    const ruleSet = (this.puzzle && this.puzzle.ruleSet) || 'freestyle';
    const move =
      selected === undefined
        ? this.puzzle && this.puzzle.challenge
          ? puzzleDefense.selectMove(this.board, this.puzzle.moves - this.moves, {
              ruleSet,
              vct: Boolean(this.puzzle.vct),
            })
          : gomokuAi.selectMove(this.board, board.WHITE, board.BLACK, {
              difficulty: this.difficulty,
            })
        : selected;
    this.aiThinking = false;
    if (!move) {
      this.finishGame('和棋');
      return null;
    }
    if (this.puzzle) {
      this.puzzleMoves.push({ row: move.row, col: move.col });
    }
    this.placeMove(move.row, move.col, board.WHITE);
    if (!this.finishAfterMove(move.row, move.col, board.WHITE, 'AI 获胜')) {
      this.currentPlayer = board.BLACK;
      this.deadline = 0;
      if (this.puzzle && this.puzzle.challenge) {
        const remaining = this.puzzle.moves - this.moves;
        const probe = vctSearch.solve(this.board, board.BLACK, remaining, {
          allowThree: Boolean(this.puzzle.vct),
          ruleSet,
          maxNodes: 4000,
        });
        this.puzzleLostTempo = !probe.limited && !probe.proof;
      }
      this.beginTurn();
      this.persist();
      this.runtime.manager.render();
    }
    return move;
  }
  placeMove(row, col, piece) {
    this.board[row][col] = piece;
    this.lastMove = { row, col, piece };
    if (this.runtime.feedback) this.runtime.feedback.move(piece === board.BLACK);
  }
  finishAfterMove(row, col, piece, winText) {
    const ruleSet = (this.puzzle && this.puzzle.ruleSet) || 'freestyle';
    const judgement = gomokuRules.adjudicate(this.board, row, col, piece, ruleSet);
    if (judgement.foul) {
      this.finishReason = 'foul';
      this.foulText = judgement.foulText;
      this.finishGame(`${judgement.foulText}，判负`);
      return true;
    }
    if (judgement.win) {
      this.finishGame(winText);
      return true;
    }
    if (gomokuAi.isBoardFull(this.board)) {
      this.finishGame('和棋');
      return true;
    }
    return false;
  }
  finishGame(resultText) {
    if (this.gameOver) return;
    this.clearAiTimer();
    this.clock.stop();
    this.deadline = 0;
    this.pendingMove = null;
    this.aiThinking = false;
    this.gameOver = true;
    this.resultText = resultText;
    matchStore.clear(this.runtime.wx);
    const outcome = resultText === '你获胜' ? 'win' : resultText === '和棋' ? 'draw' : 'loss';
    if (this.runtime.feedback && this.runtime.feedback.result) {
      this.runtime.feedback.result(outcome);
    }
    const result = progressStore.record(this.runtime.wx, {
      id: this.id,
      mode: this.mode,
      difficulty: this.difficulty,
      puzzleId: this.puzzle && this.puzzle.id,
      title: this.puzzle ? this.puzzle.title : `${NAMES[this.difficulty]}人机`,
      outcome,
      stars: this.usedHint ? 1 : (this.attempts || this.usedStepBack) ? 2 : 3,
    });
    this.earned = result.earned;
    this.saved = result.saved;
    this.resultReveal.show();
    this.runtime.manager.render();
  }
  getResultPresentation() {
    const draw = this.resultText === '和棋';
    const won = this.resultText === '你获胜';
    const growth = progressStore.read(this.runtime.wx);
    return {
      badge: draw ? '和' : won ? '胜' : this.finishReason === 'foul' ? '禁' : '再',
      badgeFill: draw ? COLORS.gold : won ? COLORS.jade : COLORS.danger,
      title:
        this.finishReason === 'timeout'
          ? '超时判负'
          : this.finishReason === 'foul'
            ? this.foulText || '触犯禁手'
            : this.puzzle
              ? won
                ? '破局成功'
                : '再想一步'
              : draw
                ? '本局和棋'
                : won
                  ? '你获胜'
                  : 'AI 获胜',
      subtitle: this.finishReason === 'foul'
        ? '黑棋不可形成三三、四四或长连，避开禁手再试'
        : this.puzzle
          ? won
            ? `${this.puzzle.title} · ${this.usedHint ? '★' : (this.attempts || this.usedStepBack) ? '★★' : '★★★'}`
            : '试着制造对手无法同时防住的威胁'
          : won
            ? '漂亮，这一局拿下了'
            : '每一盘，都是下一盘的经验',
      color: draw ? '#765622' : won ? COLORS.jade : COLORS.danger,
      note: !this.saved
        ? '本机存储不可用，进度未保存'
        : this.earned
          ? `+${this.earned} 修习值 · ${progressStore.level(growth).title}`
          : this.puzzle
            ? won
              ? '已保留本题最佳星级'
              : '规定步数内取胜才算通关'
            : '再来一局仍由你执黑先行',
      noteFill: won ? COLORS.jadeSoft : COLORS.goldSoft,
      noteColor: COLORS.jade,
      winner: draw ? undefined : won ? 'black' : 'white',
    };
  }
  getResultPlayers() {
    const winner = this.getResultPresentation().winner;
    return [
      {
        nickname: '你',
        label: '黑棋 · 先手',
        piece: 'black',
        isSelf: true,
        isWinner: winner === 'black',
      },
      {
        nickname: this.puzzle ? '残局守方' : '棋遇 AI',
        label: this.puzzle ? '白棋 · 后手' : `白棋 · ${NAMES[this.difficulty]}`,
        piece: 'white',
        isWinner: winner === 'white',
      },
    ];
  }
  changeDifficulty(difficulty) {
    if (difficulty === this.difficulty) return;
    const apply = () => {
      this.difficulty = difficulty;
      progressStore.setSetting(this.runtime.wx, 'difficulty', difficulty);
      this.restart();
    };
    if (!this.moves || this.gameOver) {
      apply();
      return;
    }
    this.confirm('切换难度？', '当前练习会重新开始，未结束的对局不计入战绩。', apply);
  }
  confirm(title, content, action) {
    if (!this.runtime.wx || !this.runtime.wx.showModal) {
      action();
      return;
    }
    this.runtime.wx.showModal({
      title,
      content,
      confirmText: '重新开始',
      confirmColor: COLORS.jade,
      success: (result) => {
        if (result && result.confirm && this.active) action();
      },
    });
  }
  confirmRestart() {
    if (!this.moves) {
      this.restart();
      return;
    }
    this.confirm(
      this.puzzle ? '重试本题？' : '重新开始？',
      this.puzzle ? '当前尝试将重置，通关后仍会保存最佳星级。' : '未结束的对局不计入战绩。',
      () => this.restart(),
    );
  }
  toggleHint() {
    if (!this.puzzle || this.gameOver || this.demoMode) return;
    this.pendingMove = null;
    if (this.hintLevel === 0) {
      const ruleSet = this.puzzle.ruleSet || 'freestyle';
      let move = null;
      if (this.moves === 0 && Array.isArray(this.puzzle.solution)) {
        move = this.puzzle.solution;
      } else {
        const res = vctSearch.findHint(this.board, Math.max(1, this.puzzle.moves - this.moves), {
          ruleSet,
          allowThree: Boolean(this.puzzle.vct),
          maxNodes: 15000,
        });
        move = res ? res.move : null;
      }
      if (move) {
        this.hintData = {
          lost: false,
          move,
          zone: {
            minRow: Math.max(0, move[0] - 1),
            maxRow: Math.min(14, move[0] + 1),
            minCol: Math.max(0, move[1] - 1),
            maxCol: Math.min(14, move[1] + 1),
          },
          text: this.puzzle.hint,
        };
      } else {
        this.hintData = {
          lost: true,
          move: null,
          zone: null,
          text: '当前已失先机，建议点击「退一步」回到分叉点重算。',
        };
      }
      this.hintLevel = 1;
      this.hintVisible = true;
      this.usedHint = true;
    } else if (this.hintLevel === 1 && this.hintData && !this.hintData.lost) {
      this.hintLevel = 2;
      this.hintVisible = true;
    } else {
      this.hintLevel = 0;
      this.hintVisible = false;
      this.hintData = null;
    }
    this.persist();
    this.runtime.manager.render();
  }
  stepBack() {
    if (!this.puzzle || this.gameOver || this.aiThinking || this.demoMode || !this.puzzleHistory.length) return;
    this.clearAiTimer();
    const snap = this.puzzleHistory.pop();
    this.board = snap.board.map(row => row.slice());
    this.lastMove = snap.lastMove;
    this.moves = snap.moves;
    this.puzzleMoves = snap.puzzleMoves.slice();
    this.currentPlayer = board.BLACK;
    this.aiThinking = false;
    this.pendingMove = null;
    this.hintLevel = 0;
    this.hintVisible = false;
    this.hintData = null;
    this.puzzleLostTempo = false;
    this.usedStepBack = true;
    this.persist();
    this.runtime.manager.render();
  }
  enterDemoMode() {
    if (!this.puzzle) return;
    this.clearAiTimer();
    this.resultReveal.hide();
    this.gameOver = false;
    this.resultText = '';
    this.pendingMove = null;
    this.hintLevel = 0;
    this.hintVisible = false;
    this.hintData = null;
    this.puzzleLostTempo = false;
    this.finishReason = '';
    this.demoMode = true;
    this.demoSteps = buildDemoSteps(this.puzzle);
    this.demoIndex = 0;
    this.syncDemoBoard();
    this.runtime.manager.render();
  }
  stepDemo(delta) {
    if (!this.demoMode) return;
    const nextIndex = Math.max(0, Math.min(this.demoSteps.length, this.demoIndex + delta));
    if (nextIndex === this.demoIndex) return;
    this.demoIndex = nextIndex;
    this.syncDemoBoard();
    this.runtime.manager.render();
  }
  syncDemoBoard() {
    this.board = puzzles.createPosition(this.puzzle);
    this.puzzleMoves = [];
    this.lastMove = null;
    for (let i = 0; i < this.demoIndex; i += 1) {
      const step = this.demoSteps[i];
      this.board[step.row][step.col] = step.piece;
      this.lastMove = { row: step.row, col: step.col, piece: step.piece };
      this.puzzleMoves.push({ row: step.row, col: step.col });
    }
  }
  restart() {
    this.clearAiTimer();
    matchStore.clear(this.runtime.wx);
    this.resultReveal.hide();
    this.board = this.puzzle ? puzzles.createPosition(this.puzzle) : board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
    this.pendingMove = null;
    this.gameOver = false;
    this.resultText = '';
    this.aiThinking = false;
    this.moves = 0;
    this.hintVisible = false;
    this.hintLevel = 0;
    this.hintData = null;
    this.puzzleHistory = [];
    this.puzzleMoves = [];
    this.puzzleLostTempo = false;
    this.foulText = '';
    this.demoMode = false;
    this.demoSteps = [];
    this.demoIndex = 0;
    this.attempts += 1;
    this.id = matchId();
    this.earned = 0;
    this.saved = true;
    this.clock.stop();
    this.deadline = 0;
    this.undoStack = [];
    this.undoLeft = this.rules.undoLimit;
    this.finishReason = '';
    this.beginTurn();
    this.runtime.manager.render();
  }
  undo() {
    if (
      this.gameOver ||
      this.puzzle ||
      !this.rules.allowUndo ||
      !this.undoLeft ||
      !this.undoStack.length ||
      this.checkTimeout()
    )
      return;
    const before = this.undoStack.pop();
    const now = Date.now();
    const current = this.deadline ? Math.max(0, this.deadline - now) : Infinity;
    const elapsedAfterReply = this.currentPlayer === board.BLACK && this.turnStartedAt ? Math.max(0, now - this.turnStartedAt) : 0;
    this.clearAiTimer();
    this.clock.stop();
    this.board = before.board.map(row => row.slice());
    this.moves = before.moves;
    this.lastMove = before.lastMove;
    this.pendingMove = null;
    this.currentPlayer = board.BLACK;
    this.aiThinking = false;
    this.undoLeft -= 1;
    this.deadline = this.rules.turnSeconds
      ? now +
        Math.min(
          current,
          before.remainingMs === null ? this.rules.turnSeconds * 1000 : Math.max(0, before.remainingMs - elapsedAfterReply),
        )
      : 0;
    this.turnStartedAt = this.deadline ? now : 0;
    matchStore.clear(this.runtime.wx);
    this.persist();
    if (!this.checkTimeout()) this.beginTurn();
    this.runtime.manager.render();
  }
}

AiGameScene.AI_THINK_DELAY = AI_THINK_DELAY;
AiGameScene.NAMES = NAMES;
module.exports = AiGameScene;
