const board = require('../../utils/board');
const gomokuAi = require('../../utils/gomokuAi');
const progressStore = require('../../utils/progressStore');
const matchStore = require('../../utils/localMatchStore');
const puzzles = require('../../utils/puzzles');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawCard, drawPill } = require('../renderers/cardRenderer');
const { createResultReveal, drawResultOverlay } = require('../renderers/resultOverlayRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');

const AI_THINK_DELAY = 460;
const NAMES = { easy: '入门', normal: '进阶', hard: '挑战' };
let sequence = 0;
function matchId() { sequence += 1; return `local-${Date.now()}-${sequence}-${Math.random().toString(36).slice(2, 8)}`; }

class AiGameScene {
  constructor(runtime, params = {}) {
    this.runtime = runtime;
    const requestedPuzzle = puzzles.getPuzzle(params.puzzleId);
    const index = requestedPuzzle ? puzzles.PUZZLES.indexOf(requestedPuzzle) : -1;
    this.puzzle = index >= 0 && puzzles.isUnlocked(index, progressStore.read(runtime.wx)) ? requestedPuzzle : null;
    this.mode = this.puzzle ? 'puzzle' : 'ai';
    this.difficulty = this.puzzle ? 'hard' : (NAMES[params.difficulty] ? params.difficulty : progressStore.read(runtime.wx).settings.difficulty);
    this.board = this.puzzle ? puzzles.createPosition(this.puzzle) : board.createBoard();
    this.currentPlayer = board.BLACK;
    this.lastMove = null;
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
    this.id = matchId();
    this.earned = 0;
    this.saved = true;
    this.resultReveal = createResultReveal(runtime, () => runtime.manager.render());
    const resume = params.resume;
    if (resume && resume.mode === this.mode && (!this.puzzle || resume.puzzleId === this.puzzle.id)) {
      const valid = matchStore.load(runtime.wx);
      if (valid && valid.id === resume.id) {
        this.board = valid.board;
        this.currentPlayer = valid.currentPlayer;
        this.lastMove = valid.lastMove && board.isValidPos(valid.lastMove.row, valid.lastMove.col) ? valid.lastMove : null;
        this.difficulty = this.puzzle ? 'hard' : valid.difficulty;
        this.id = valid.id;
        this.moves = Number.isSafeInteger(valid.moves) && valid.moves >= 0 ? valid.moves : 0;
        this.attempts = Number.isSafeInteger(valid.attempts) && valid.attempts >= 0 ? valid.attempts : 0;
        this.usedHint = Boolean(valid.usedHint);
      }
    }
  }

  onEnter() { this.active = true; if (this.currentPlayer === board.WHITE) this.scheduleAiMove(); }
  onHide() { this.active = false; this.clearAiTimer(); this.persist(); }
  onResume() { this.active = true; if (!this.gameOver && this.currentPlayer === board.WHITE) this.scheduleAiMove(); }
  onExit() { this.active = false; this.clearAiTimer(); this.persist(); this.resultReveal.dispose(); }

  persist() {
    if (this.gameOver || (!this.moves && !this.lastMove && (this.mode === 'ai' || (!this.usedHint && !this.attempts)))) return;
    this.saved = matchStore.save(this.runtime.wx, {
      mode: this.mode, puzzleId: this.puzzle ? this.puzzle.id : '', difficulty: this.difficulty,
      board: this.board, currentPlayer: this.currentPlayer, lastMove: this.lastMove,
      id: this.id, moves: this.moves, attempts: this.attempts, usedHint: this.usedHint,
    });
  }

  getLayout() {
    const safeTop = getContentTop(this.runtime.wx);
    const boardTop = safeTop + 124;
    return { safeTop, boardTop, maxBoardSize: Math.max(220, this.runtime.height - boardTop - 108 - Math.max(0, (this.runtime.bottomInset || 18) - 18)) };
  }

  render(ctx, input) {
    const { width, height, manager } = this.runtime;
    const layout = this.getLayout();
    this.boardRect = boardRenderer.getBoardRect(width, layout.boardTop, layout.maxBoardSize);
    drawLabel(ctx, this.puzzle ? this.puzzle.title : '人机对战', 20, layout.safeTop + 14, 'left', { bold: true, size: 21 });
    drawLabel(ctx, this.puzzle ? `${this.puzzle.moves} 步内执黑取胜` : '你执黑 · AI 执白', width - 20, layout.safeTop + 14, 'right', { size: 11, color: COLORS.inkMuted });
    if (this.puzzle) {
      drawCard(ctx, { x: 20, y: layout.safeTop + 36, width: width - 40, height: 44, fill: COLORS.goldSoft, shadow: false });
      drawLabel(ctx, this.puzzle.theme, 34, layout.safeTop + 57, 'left', { size: 12, bold: true, color: '#765622', maxWidth: width - 135 });
      drawButton(ctx, input, { x: width - 98, y: layout.safeTop + 38, width: 76, height: 40, text: this.hintVisible ? '收起' : '提示', fontSize: 13, variant: 'gold', disabled: this.aiThinking || this.gameOver, onTap: () => this.toggleHint() });
    } else {
      const gap = 8; const w = (width - 40 - gap * 2) / 3;
      Object.keys(NAMES).forEach((difficulty, index) => {
        drawButton(ctx, input, { x: 20 + index * (w + gap), y: layout.safeTop + 38, width: w, height: 40, text: NAMES[difficulty], fontSize: 14, variant: this.difficulty === difficulty ? 'primary' : 'gold', disabled: this.gameOver, onTap: () => this.changeDifficulty(difficulty) });
      });
    }
    drawPill(ctx, { x: 20, y: layout.safeTop + 88, width: width - 40, height: 28, text: this.getStatusText(), fill: this.aiThinking ? COLORS.surfaceMuted : COLORS.jadeSoft, color: this.aiThinking ? COLORS.inkMuted : COLORS.jade });
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);
    if (!this.gameOver) {
      const buttonY = this.boardRect.y + this.boardRect.height + 16;
      const w = (width - 52) / 2;
      drawButton(ctx, input, { x: 20, y: buttonY, width: w, height: 44, text: this.puzzle ? '重试本题' : '重新开始', variant: 'secondary', onTap: () => this.confirmRestart() });
      drawButton(ctx, input, { x: 32 + w, y: buttonY, width: w, height: 44, text: this.puzzle ? '返回关卡' : '返回首页', variant: 'gold', onTap: () => manager.go(this.puzzle ? 'puzzleList' : 'home') });
      drawLabel(ctx, this.saved ? (this.puzzle ? `剩余 ${Math.max(0, this.puzzle.moves - this.moves)} 步 · 首次通关 +25 修习值` : `${{ easy: '入门 · 宽松练习', normal: '进阶 · 攻防兼顾', hard: '挑战 · 预判回应' }[this.difficulty]} · 自动保存`) : '本机存储暂不可用，本次进度未保存', width / 2, buttonY + 66, 'center', { size: 11, color: this.saved ? COLORS.inkMuted : COLORS.danger, maxWidth: width - 32 });
    }
    if (this.hintVisible && !this.gameOver) {
      const y = this.boardRect.y + 8;
      drawCard(ctx, { x: 24, y, width: width - 48, height: 78, fill: '#FFFAEE', stroke: '#C6AE76' });
      drawLabel(ctx, '战术提示 · 使用后本题最高一星', 38, y + 19, 'left', { bold: true, size: 11, color: '#765622' });
      const length = Math.max(12, Math.floor((width - 76) / 12));
      drawLabel(ctx, this.puzzle.hint.slice(0, length), 38, y + 42, 'left', { size: 12 });
      drawLabel(ctx, this.puzzle.hint.slice(length), 38, y + 61, 'left', { size: 12, maxWidth: width - 76 });
    }
    if (this.gameOver && this.resultReveal.isVisible()) {
      const next = this.puzzle && puzzles.PUZZLES[puzzles.PUZZLES.indexOf(this.puzzle) + 1];
      const won = this.resultText === '你获胜';
      drawResultOverlay(ctx, input, {
        width, height, safeTop: layout.safeTop, progress: this.resultReveal.getProgress(),
        presentation: this.getResultPresentation(), players: this.getResultPlayers(),
        primaryAction: { text: this.puzzle ? (won && next ? '挑战下一题' : (won ? '查看成长' : '再试一次')) : '再来一局', onTap: () => this.puzzle && won ? manager.go(next ? 'puzzleGame' : 'growth', next ? { puzzleId: next.id } : {}) : this.restart() },
        secondaryAction: { text: this.puzzle ? '返回关卡' : '我的成长', onTap: () => manager.go(this.puzzle ? 'puzzleList' : 'growth') },
      });
    }
  }

  getStatusText() {
    if (this.resultText) return this.puzzle ? (this.resultText === '你获胜' ? '破局成功' : '再想想这一步') : this.resultText;
    if (this.aiThinking) return '棋遇 AI 思考中…';
    return this.puzzle ? `轮到你 · 还可落 ${Math.max(0, this.puzzle.moves - this.moves)} 子` : '轮到你落子（黑棋）';
  }

  handleTouch(x, y) {
    if (this.gameOver || this.aiThinking || this.hintVisible || this.currentPlayer !== board.BLACK || !this.boardRect) return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) return;
    this.moves += 1;
    this.placeMove(grid.row, grid.col, board.BLACK);
    if (this.finishAfterMove(grid.row, grid.col, board.BLACK, '你获胜')) return;
    if (this.puzzle && this.moves >= this.puzzle.moves) { this.finishGame('步数用尽'); return; }
    this.currentPlayer = board.WHITE;
    this.aiThinking = true;
    this.persist();
    this.runtime.manager.render();
    this.scheduleAiMove();
  }

  scheduleAiMove(delay = AI_THINK_DELAY) {
    if (!this.active || this.gameOver || this.currentPlayer !== board.WHITE || this.aiTimer) return;
    this.aiThinking = true;
    this.aiTimer = setTimeout(() => { this.aiTimer = null; this.startAiSearch(); }, delay);
  }
  startAiSearch() {
    if (!this.active || this.gameOver || this.currentPlayer !== board.WHITE) return;
    this.aiTask = gomokuAi.createMoveTask(this.board, board.WHITE, board.BLACK, { difficulty: this.difficulty });
    const generation = this.searchGeneration;
    const tick = () => {
      this.aiTimer = null;
      if (!this.active || generation !== this.searchGeneration || !this.aiTask) return;
      const result = this.aiTask.step(4);
      if (result.done) { this.aiTask = null; this.performAiMove(result.move); }
      else this.aiTimer = setTimeout(tick, 4);
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
    if (!this.active || this.gameOver || this.currentPlayer !== board.WHITE) return null;
    const move = selected === undefined ? gomokuAi.selectMove(this.board, board.WHITE, board.BLACK, { difficulty: this.difficulty }) : selected;
    this.aiThinking = false;
    if (!move) { this.finishGame('和棋'); return null; }
    this.placeMove(move.row, move.col, board.WHITE);
    if (!this.finishAfterMove(move.row, move.col, board.WHITE, 'AI 获胜')) {
      this.currentPlayer = board.BLACK;
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
    if (board.checkWin(this.board, row, col, piece)) { this.finishGame(winText); return true; }
    if (gomokuAi.isBoardFull(this.board)) { this.finishGame('和棋'); return true; }
    return false;
  }
  finishGame(resultText) {
    if (this.gameOver) return;
    this.clearAiTimer();
    this.aiThinking = false;
    this.gameOver = true;
    this.resultText = resultText;
    matchStore.clear(this.runtime.wx);
    const outcome = resultText === '你获胜' ? 'win' : (resultText === '和棋' ? 'draw' : 'loss');
    const result = progressStore.record(this.runtime.wx, { id: this.id, mode: this.mode, difficulty: this.difficulty, puzzleId: this.puzzle && this.puzzle.id, title: this.puzzle ? this.puzzle.title : `${NAMES[this.difficulty]}人机`, outcome, stars: this.usedHint ? 1 : (this.attempts ? 2 : 3) });
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
      badge: draw ? '和' : (won ? '胜' : '再'), badgeFill: draw ? COLORS.gold : (won ? COLORS.jade : COLORS.danger),
      title: this.puzzle ? (won ? '破局成功' : '再想一步') : (draw ? '本局和棋' : (won ? '你获胜' : 'AI 获胜')),
      subtitle: this.puzzle ? (won ? `${this.puzzle.title} · ${this.usedHint ? '★' : (this.attempts ? '★★' : '★★★')}` : '试着制造对手无法同时防住的威胁') : (won ? '漂亮，这一局拿下了' : '每一盘，都是下一盘的经验'),
      color: draw ? '#765622' : (won ? COLORS.jade : COLORS.danger),
      note: !this.saved ? '本机存储不可用，进度未保存' : (this.earned ? `+${this.earned} 修习值 · ${progressStore.level(growth).title}` : (this.puzzle ? (won ? '已保留本题最佳星级' : '规定步数内取胜才算通关') : '再来一局仍由你执黑先行')),
      noteFill: won ? COLORS.jadeSoft : COLORS.goldSoft, noteColor: COLORS.jade,
      winner: draw ? undefined : (won ? 'black' : 'white'),
    };
  }
  getResultPlayers() {
    const winner = this.getResultPresentation().winner;
    return [
      { nickname: '你', label: '黑棋 · 先手', piece: 'black', isSelf: true, isWinner: winner === 'black' },
      { nickname: this.puzzle ? '残局守方' : '棋遇 AI', label: this.puzzle ? '白棋 · 后手' : `白棋 · ${NAMES[this.difficulty]}`, piece: 'white', isWinner: winner === 'white' },
    ];
  }
  changeDifficulty(difficulty) {
    if (difficulty === this.difficulty) return;
    const apply = () => { this.difficulty = difficulty; progressStore.setSetting(this.runtime.wx, 'difficulty', difficulty); this.restart(); };
    if (!this.moves || this.gameOver) { apply(); return; }
    this.confirm('切换难度？', '当前练习会重新开始，未结束的对局不计入战绩。', apply);
  }
  confirm(title, content, action) {
    if (!this.runtime.wx || !this.runtime.wx.showModal) { action(); return; }
    this.runtime.wx.showModal({ title, content, confirmText: '重新开始', confirmColor: COLORS.jade, success: result => { if (result && result.confirm && this.active) action(); } });
  }
  confirmRestart() {
    if (!this.moves) { this.restart(); return; }
    this.confirm(this.puzzle ? '重试本题？' : '重新开始？', this.puzzle ? '当前尝试将重置，通关后仍会保存最佳星级。' : '未结束的对局不计入战绩。', () => this.restart());
  }
  toggleHint() { this.hintVisible = !this.hintVisible; if (this.hintVisible) this.usedHint = true; this.persist(); this.runtime.manager.render(); }
  restart() {
    this.clearAiTimer(); matchStore.clear(this.runtime.wx); this.resultReveal.hide();
    this.board = this.puzzle ? puzzles.createPosition(this.puzzle) : board.createBoard();
    this.currentPlayer = board.BLACK; this.lastMove = null; this.gameOver = false; this.resultText = ''; this.aiThinking = false;
    this.moves = 0; this.hintVisible = false; this.attempts += 1; this.id = matchId(); this.earned = 0; this.saved = true;
    this.runtime.manager.render();
  }
}

AiGameScene.AI_THINK_DELAY = AI_THINK_DELAY;
AiGameScene.NAMES = NAMES;
module.exports = AiGameScene;
