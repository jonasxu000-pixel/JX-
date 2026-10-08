const board = require('../../utils/board');
const onlineGameState = require('../../utils/onlineGameState');
const boardRenderer = require('../renderers/boardRenderer');
const { drawButton } = require('../renderers/buttonRenderer');
const { drawLabel } = require('../renderers/textRenderer');
const { drawPill, roundedRectPath } = require('../renderers/cardRenderer');
const { createResultReveal, drawResultOverlay } = require('../renderers/resultOverlayRenderer');
const { drawAvatar } = require('../renderers/avatarRenderer');
const { COLORS } = require('../design/theme');
const { getContentTop } = require('../../utils/safeArea');
const { toUserMessage } = require('../../utils/userFacingError');
const { getStoredPlayer } = require('../../utils/playerSession');
const { showToast } = require('../../utils/clipboard');
const roomSession = require('../../utils/roomSession');
const matchRules = require('../../utils/matchRules');
const { drawClock, drawUndoPrompt } = require('../renderers/ruleRenderer');

class OnlineGameScene {
  constructor(runtime, params) {
    this.runtime = runtime;
    this.roomId = params.roomId;
    this.viewId = params.viewId;
    this.role = params.role || 'host';
    this.color = params.color || (this.role === 'host' ? 'black' : 'white');
    this.board = board.createBoard();
    this.lastMove = null;
    this.currentPlayer = board.BLACK;
    this.statusText = '正在同步房间...';
    this.resultText = '';
    this.gameOver = false;
    this.shouldShowResult = false;
    this.isMyTurn = false;
    this.boardLocked = true;
    this.syncing = false;
    this.moveSubmitting = false;
    this.restartSubmitting = false;
    this.surrenderSubmitting = false;
    this.restartReady = false;
    this.opponentRestartReady = false;
    this.watcher = null;
    this.restartTimer = null;
    this.boardRect = null;
    this.active = false;
    this.leaving = false;
    this.exited = false;
    this.syncRevision = 0;
    this.localPlayer = getStoredPlayer(runtime.wx);
    this.hostPlayer = createDisplayPlayer(null, '黑棋棋手');
    this.guestPlayer = createDisplayPlayer(null, '白棋棋手');
    this.resultReveal = createResultReveal(runtime, () => runtime.manager.render());
    this.rules = matchRules.normalize({ turnSeconds: 0, allowUndo: false });
    this.ruleVersion = 0;
    this.turnDeadline = 0;
    this.serverOffset = 0;
    this.clockSynced = false;
    this.pendingUndo = null;
    this.undoUsed = { host: 0, guest: 0 };
    this.moveCount = 0;
    this.ruleSubmitting = false;
    this.clockSyncing = false;
    this.clockRetryAt = 0;
    this.readsInFlight = 0;
    this.lifecycle = 0;
    this.clock = matchRules.createTicker(() => {
      if (!this.active || this.gameOver || this.leaving) return false;
      const now = Date.now() + this.serverOffset;
      if (
        (this.turnDeadline && now >= this.turnDeadline) ||
        (this.pendingUndo && now >= this.pendingUndo.expiresAt) ||
        (this.ruleVersion === 1 && !this.clockSynced)
      ) {
        if (this.turnDeadline && now >= this.turnDeadline) {
          this.boardLocked = true;
          this.statusText = '正在确认超时结果…';
        }
        if (!this.clockSyncing && !this.readsInFlight && Date.now() >= this.clockRetryAt) {
          this.clockSyncing = true;
          this.clockRetryAt = Date.now() + 3000;
          const lifecycle = this.lifecycle;
          this.loadRoom().finally(() => {
            if (lifecycle === this.lifecycle) this.clockSyncing = false;
          });
        }
      }
      runtime.manager.render();
      return Boolean(
        this.turnDeadline || this.pendingUndo || (this.ruleVersion === 1 && !this.clockSynced),
      );
    });
  }

  onEnter() {
    this.active = true;
    roomSession.save(this.runtime.wx, this);
    this.loadRoom();
    this.startWatch();
  }

  onResume() {
    this.lifecycle += 1;
    this.readsInFlight = 0;
    this.clockSyncing = false;
    this.active = true;
    if (this.leaving) return;
    this.clockSynced = false;
    if (this.ruleVersion === 1 && this.rules.turnSeconds) this.boardLocked = true;
    this.loadRoom();
    this.startWatch();
  }

  onHide() {
    this.lifecycle += 1;
    this.readsInFlight = 0;
    this.clockSyncing = false;
    this.active = false;
    this.clock.stop();
    this.clearWatch();
    this.clearRestart();
  }

  onExit() {
    this.lifecycle += 1;
    this.readsInFlight = 0;
    this.exited = true;
    this.active = false;
    this.clock.stop();
    this.clearWatch();
    this.clearRestart();
    this.resultReveal.dispose();
  }

  loadRoom() {
    this.readsInFlight += 1;
    const lifecycle = this.lifecycle;
    const revision = this.syncRevision;
    let sentAt = Date.now();
    const cloud = this.runtime.cloud;
    const request =
      this.ruleVersion === 1 && cloud.syncRoom
        ? cloud.syncRoom(this.roomId)
        : cloud.getRoom(this.viewId);
    return request
      .then((result) => {
        if (!this.active || lifecycle !== this.lifecycle) return null;
        if (result && result.rules && result.rules.version === 1 && cloud.syncRoom) {
          sentAt = Date.now();
          return cloud.syncRoom(this.roomId);
        }
        return result;
      })
      .then((result) => {
        if (!this.active || lifecycle !== this.lifecycle) return;
        const roomData = result && typeof result==='object' && 'roomData' in result ? result.roomData : result;
        if (result && Number.isFinite(result.serverNow)) {
          this.serverOffset = result.serverNow - (sentAt + Date.now()) / 2;
          this.clockSynced = true;
        }
        if (this.active && revision === this.syncRevision) this.applyRoom(roomData);
        else if (this.active && this.clockSynced) {
          this.lockForRules();
          this.runtime.manager.render();
        }
      })
      .catch((err) => {
        if (!this.active || lifecycle !== this.lifecycle || revision !== this.syncRevision) return;
        this.statusText = toUserMessage(err, '房间同步失败');
        this.syncing = false;
        this.boardLocked = true;
        this.runtime.manager.render();
      })
      .finally(() => {
        if (lifecycle === this.lifecycle) this.readsInFlight = Math.max(0, this.readsInFlight - 1);
      });
  }

  startWatch() {
    if (!this.active) return;
    this.clearWatch();
    this.clearRestart();
    this.watcher = this.runtime.cloud.watchRoom(
      this.viewId,
      (roomData) => {
        if (this.active) this.applyRoom(roomData);
      },
      () => {
        if (this.active) {
          this.boardLocked = true;
          this.statusText = '连接中断，正在重新同步…';
          this.runtime.manager.render();
          this.scheduleRestart();
        }
      },
    );
  }

  applyRoom(roomData) {
    if (!this.active || this.leaving) return;
    this.syncRevision += 1;
    if (!roomData) roomSession.clear(this.runtime.wx, this.roomId);

    if (roomData && roomData.status === 'waiting' && this.role === 'host') {
      this.runtime.manager.go('waitRoom', {
        roomId: this.roomId,
        viewId: this.viewId,
        role: this.role,
        color: this.color,
      });
      return;
    }

    const wasShowingResult = this.shouldShowResult;
    const viewState = onlineGameState.deriveOnlineGameState(roomData, this.role);
    this.currentPlayer = viewState.currentPlayer;
    this.statusText = viewState.statusText;
    this.resultText = viewState.resultText;
    this.gameOver = viewState.gameOver;
    this.shouldShowResult = viewState.shouldShowResult;
    this.isMyTurn = viewState.isMyTurn;
    this.boardLocked = viewState.boardLocked;
    this.syncing = false;
    this.moveSubmitting = false;
    const restartReady = (roomData && roomData.restartReady) || {};
    this.restartReady = Boolean(restartReady[this.role]);
    const opponentRole = this.role === 'host' ? 'guest' : 'host';
    this.opponentRestartReady = Boolean(restartReady[opponentRole]);
    this.finishReason = roomData && roomData.finishReason;
    this.winnerRole = roomData && roomData.winner;
    this.timedOutBy = roomData && roomData.timedOutBy;
    this.ruleVersion = (roomData && roomData.rules && roomData.rules.version) || 0;
    this.rules = matchRules.normalize(
      (roomData && roomData.rules) || { turnSeconds: 0, allowUndo: false },
    );
    this.turnDeadline = (roomData && roomData.turnDeadline) || 0;
    this.pendingUndo = (roomData && roomData.pendingUndo) || null;
    this.undoUsed = (roomData && roomData.undoRequestsUsed) || { host: 0, guest: 0 };
    this.moveCount = (roomData && roomData.moveCount) || 0;
    this.lockForRules();
    this.surrenderedBy = roomData && roomData.surrenderedBy;
    this.hostPlayer = this.getRoomDisplayPlayer(roomData && roomData.host, 'host');
    this.guestPlayer = this.getRoomDisplayPlayer(roomData && roomData.guest, 'guest');

    if (roomData && Array.isArray(roomData.board)) {
      const next = roomData.lastMove;
      if (
        this.lastMove &&
        next &&
        (next.row !== this.lastMove.row ||
          next.col !== this.lastMove.col ||
          next.piece !== this.lastMove.piece) &&
        this.runtime.feedback
      )
        this.runtime.feedback.move(
          viewState.currentPlayer !== (this.role === 'host' ? board.BLACK : board.WHITE),
        );
      this.board = normalizeBoard(roomData.board);
      this.lastMove = roomData.lastMove || null;
    }

    if (this.shouldShowResult && !wasShowingResult) {
      this.resultReveal.show();
    } else if (!this.shouldShowResult && wasShowingResult) {
      this.resultReveal.hide();
    }

    this.runtime.manager.render();
    this.clock.start();
  }

  lockForRules() {
    this.boardLocked =
      this.gameOver ||
      !this.isMyTurn ||
      this.ruleSubmitting ||
      Boolean(this.pendingUndo) ||
      Boolean(this.ruleVersion === 1 && this.rules.turnSeconds && !this.clockSynced) ||
      Boolean(this.turnDeadline && Date.now() + this.serverOffset >= this.turnDeadline);
  }

  scheduleRestart() {
    if (!this.active || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.active) return;
      this.loadRoom().finally(() => this.startWatch());
    }, 1000);
  }

  clearWatch() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  }

  clearRestart() {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  render(ctx, input) {
    const { width, height } = this.runtime;
    const safeTop = getContentTop(this.runtime.wx);
    const statusY = safeTop + 94;
    const boardTop = safeTop + 144;
    const maxBoardSize =
      height - boardTop - 130 - Math.max(0, (this.runtime.bottomInset || 18) - 18);
    this.boardRect = boardRenderer.getBoardRect(width, boardTop, maxBoardSize);

    drawRoomHeading(ctx, `好友房 ${this.roomId}`, width / 2, safeTop + 10);
    this.renderPlayerCards(ctx, safeTop);

    drawClock(
      ctx,
      { x: 16, y: statusY, width: width - 122, height: 38 },
      this.syncing ? '正在同步棋局…' : this.statusText,
      this.turnDeadline,
      Date.now() + this.serverOffset,
    );
    if (!this.gameOver) {
      drawButton(ctx, input, {
        x: width - 94,
        y: statusY,
        width: 78,
        height: 38,
        text: '⚑ 投降',
        variant: 'danger',
        fontSize: 14,
        disabled: this.surrenderSubmitting,
        onTap: () => this.confirmSurrender(),
      });
    }
    boardRenderer.drawBoard(ctx, this.board, this.lastMove, this.boardRect);

    if (!this.shouldShowResult) {
      drawButton(ctx, input, {
        x: 20,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 52) / 2,
        height: 46,
        text: this.leaving ? '正在退出…' : '退出本局',
        disabled: this.leaving,
        variant: 'ghost',
        onTap: () => this.leaveToHome(),
      });
      drawButton(ctx, input, {
        x: 32 + (width - 52) / 2,
        y: this.boardRect.y + this.boardRect.height + 24,
        width: (width - 52) / 2,
        height: 46,
        text: this.rules.allowUndo
          ? `申请悔棋 ${Math.max(0, 2 - (this.undoUsed[this.role] || 0))}`
          : '不可悔棋',
        fontSize: 13,
        variant: 'gold',
        disabled:
          this.gameOver ||
          !this.rules.allowUndo ||
          !this.isMyTurn ||
          this.moveCount < 2 ||
          Boolean(this.pendingUndo) ||
          this.ruleSubmitting ||
          this.leaving ||
          this.boardLocked ||
          (this.undoUsed[this.role] || 0) >= 2,
        onTap: () => this.submitRule('requestUndo'),
      });
      drawLabel(
        ctx,
        matchRules.summary(this.rules),
        width / 2,
        this.boardRect.y + this.boardRect.height + 86,
        'center',
        { size: 10, color: '#816B4C', maxWidth: width - 36 },
      );
    }

    if (this.shouldShowResult && this.resultReveal.isVisible()) {
      drawResultOverlay(ctx, input, {
        width,
        height,
        safeTop,
        progress: this.resultReveal.getProgress(),
        presentation: this.getResultPresentation(),
        players: this.getResultPlayers(),
        wxApi: this.runtime.wx,
        onAvatarReady: () => this.runtime.manager.render(),
        primaryAction: {
          text: this.getRestartButtonText(),
          disabled: this.leaving || this.restartSubmitting || this.restartReady,
          onTap: () => this.restartRoom(),
        },
        secondaryAction: {
          text: this.leaving ? '正在退出…' : '返回首页',
          disabled: this.leaving,
          onTap: () => this.leaveToHome(),
        },
      });
    }
    this.renderUndo(ctx, input);
  }

  renderUndo(ctx, input) {
    if (!this.pendingUndo || this.gameOver) return;
    const pending = this.pendingUndo;
    const own = pending.by === this.role;
    drawUndoPrompt(ctx, input, this.runtime, {
      title: own ? '等待对手确认' : '对手申请悔棋',
      note: '退回双方最近各一手，不补回已用时间',
      detail: `${Math.max(0, Math.ceil((pending.expiresAt - Date.now() - this.serverOffset) / 1000))} 秒未回应则拒绝 · 等待也计时`,
      rejectText: own ? '取消申请' : '拒绝',
      onReject: () =>
        own
          ? this.submitRule('cancelUndo', pending.id)
          : this.submitRule('respondUndo', pending.id, false),
      onAccept: own ? null : () => this.submitRule('respondUndo', pending.id, true),
      disabled: this.ruleSubmitting,
    });
  }

  submitRule(method, ...args) {
    if (
      !this.active ||
      this.gameOver ||
      this.ruleSubmitting ||
      this.leaving ||
      !this.runtime.cloud[method]
    )
      return;
    const revision = this.syncRevision;
    const lifecycle = this.lifecycle;
    const sent = Date.now();
    this.ruleSubmitting = true;
    this.boardLocked = true;
    this.runtime.manager.render();
    this.runtime.cloud[method](this.roomId, ...args)
      .then((result) => {
        if (!this.active || lifecycle !== this.lifecycle) return;
        if (Number.isFinite(result.serverNow)) {
          this.serverOffset = result.serverNow - (sent + Date.now()) / 2;
          this.clockSynced = true;
        }
        if (revision === this.syncRevision && 'roomData' in result) this.applyRoom(result.roomData);
      })
      .catch((err) => {
        if (this.active) showToast(this.runtime.wx, toUserMessage(err, '悔棋操作失败'));
      })
      .finally(() => {
        this.ruleSubmitting = false;
        if (this.active) this.loadRoom();
      });
  }

  getRoomDisplayPlayer(roomPlayer, playerRole) {
    if (playerRole === this.role && this.localPlayer) return this.localPlayer;
    return createDisplayPlayer(roomPlayer, playerRole === 'host' ? '黑棋棋手' : '白棋棋手');
  }

  renderPlayerCards(ctx, safeTop) {
    const { width, manager } = this.runtime;
    const centerGap = 18;
    const sidePadding = 10;
    const cardWidth = (width - sidePadding * 2 - centerGap) / 2;
    const y = safeTop + 24;
    this.renderPlayerCard(ctx, {
      x: sidePadding,
      y,
      width: cardWidth,
      player: this.hostPlayer,
      role: 'host',
      label: '黑棋 · 先手',
      manager,
      align: 'left',
    });
    this.renderPlayerCard(ctx, {
      x: sidePadding + cardWidth + centerGap,
      y,
      width: cardWidth,
      player: this.guestPlayer,
      role: 'guest',
      label: '白棋 · 后手',
      manager,
      align: 'right',
    });
    drawDuelMedallion(ctx, width / 2, y + 29);
  }

  renderPlayerCard(ctx, options) {
    const { x, y, width, player, role, label, manager, align } = options;
    const isSelf = role === this.role;
    const isActive =
      !this.gameOver &&
      ((this.currentPlayer === board.BLACK && role === 'host') ||
        (this.currentPlayer === board.WHITE && role === 'guest'));
    const isLeft = align === 'left';
    const avatarSize = 38;
    const avatarX = isLeft ? x + 1 : x + width - avatarSize - 1;
    const bodyX = isLeft ? x + 20 : x;
    const bodyWidth = width - 20;
    drawPlayerRibbon(ctx, {
      x: bodyX,
      y: y + 4,
      width: bodyWidth,
      height: 50,
      isActive,
      align,
    });
    if (isActive) drawAvatarHalo(ctx, avatarX + avatarSize / 2, y + 29, 22);
    drawAvatar(ctx, this.runtime.wx, player, avatarX, y + 10, avatarSize, () => manager.render());

    const textX = isLeft ? x + 45 : x + width - 45;
    const textAlign = isLeft ? 'left' : 'right';
    drawFittedPlayerName(ctx, player.nickname, textX, y + 20, width - 48, textAlign);
    const stoneX = isLeft ? textX + 5 : textX - 5;
    drawPlayerStone(ctx, stoneX, y + 42, role);
    const selfLabel = role === 'host' ? '黑棋先手 · 我' : '白棋后手 · 我';
    drawLabel(
      ctx,
      isSelf ? selfLabel : label,
      isLeft ? textX + 16 : textX - 16,
      y + 42,
      textAlign,
      {
        size: 11,
        color: isActive ? COLORS.jade : COLORS.inkMuted,
      },
    );
    if (isActive) {
      drawTurnMarker(ctx, isLeft ? x + width - 5 : x + 5, y + 29);
    }
  }

  getResultPresentation() {
    if (this.finishReason === 'timeout')
      return {
        badge: this.winnerRole === this.role ? '胜' : '负',
        badgeFill: this.winnerRole === this.role ? COLORS.jade : COLORS.danger,
        title: this.winnerRole === this.role ? '对手超时，你获胜' : '超时判负',
        subtitle: '未在本步时限内落子',
        color: this.winnerRole === this.role ? COLORS.jade : COLORS.danger,
        note: this.getRestartSubtitle('超时按服务器时间判定，可再来一局'),
      };
    if (this.resultText === '对手投降，你获胜') {
      return {
        badge: '胜',
        badgeFill: COLORS.jade,
        title: '你获胜',
        subtitle: '对手已投降',
        color: COLORS.jade,
        note: this.getRestartSubtitle('本局已结束，可邀请对手再战'),
      };
    }
    if (this.resultText === '你已投降') {
      return {
        badge: '负',
        badgeFill: COLORS.danger,
        title: '你已投降',
        subtitle: '本局已结束',
        color: COLORS.danger,
        note: this.getRestartSubtitle('调整思路，再来一盘'),
        noteFill: COLORS.dangerSoft,
        noteColor: COLORS.danger,
      };
    }
    if (this.resultText === '你获胜') {
      return {
        badge: '胜',
        badgeFill: COLORS.jade,
        title: '你获胜',
        subtitle: '漂亮，这一局拿下了',
        color: COLORS.jade,
        note: this.getRestartSubtitle('棋逢对手，不妨再来一盘'),
      };
    }
    if (this.resultText === '对手获胜') {
      return {
        badge: '负',
        badgeFill: COLORS.danger,
        title: '本局惜败',
        subtitle: '调整思路，再来一盘',
        color: COLORS.danger,
        note: this.getRestartSubtitle('下一局重新来过'),
        noteFill: COLORS.dangerSoft,
        noteColor: COLORS.danger,
      };
    }
    return {
      badge: '和',
      badgeFill: COLORS.gold,
      title: '本局和棋',
      subtitle: '势均力敌',
      color: '#765622',
      note: this.getRestartSubtitle('难分高下，再战一局'),
      noteFill: COLORS.goldSoft,
      noteColor: '#765622',
    };
  }

  getResultPlayers() {
    const winnerRole = this.getWinnerRole();
    return [
      {
        player: this.hostPlayer,
        nickname: this.hostPlayer.nickname,
        label: '黑棋 · 先手',
        isSelf: this.role === 'host',
        isWinner: winnerRole === 'host',
        piece: 'black',
      },
      {
        player: this.guestPlayer,
        nickname: this.guestPlayer.nickname,
        label: '白棋 · 后手',
        isSelf: this.role === 'guest',
        isWinner: winnerRole === 'guest',
        piece: 'white',
      },
    ];
  }

  getWinnerRole() {
    if (this.winnerRole) return this.winnerRole;
    if (this.resultText === '和棋') return null;
    if (this.resultText === '你获胜' || this.resultText === '对手投降，你获胜') {
      return this.role;
    }
    return this.role === 'host' ? 'guest' : 'host';
  }

  getRestartButtonText() {
    if (this.restartSubmitting) return '正在确认…';
    if (this.restartReady) return '已准备，等待对手';
    if (this.opponentRestartReady) return '同意再来一局';
    return '再来一局';
  }

  getRestartSubtitle(defaultText) {
    if (this.restartReady) return '你已准备，等待对手确认后自动开局';
    if (this.opponentRestartReady) return '对手已准备，等你确认是否继续';
    return defaultText;
  }

  handleTouch(x, y) {
    if (this.ruleSubmitting) return;
    if (this.turnDeadline && Date.now() + this.serverOffset >= this.turnDeadline) {
      this.boardLocked = true;
      this.clock.start();
      return;
    }
    if (this.leaving) return;
    if (!this.boardRect || this.boardLocked || this.syncing || this.moveSubmitting) return;
    const grid = boardRenderer.hitTest(x, y, this.boardRect);
    if (!grid || this.board[grid.row][grid.col] !== board.EMPTY) return;

    this.moveSubmitting = true;
    this.syncing = true;
    this.boardLocked = true;
    this.statusText = '正在同步落子...';
    this.runtime.manager.render();

    this.runtime.cloud
      .placePiece(this.roomId, grid.row, grid.col)
      .catch((err) => {
        this.statusText = toUserMessage(err, '落子失败');
      })
      .finally(() => {
        this.loadRoom().finally(() => {
          this.moveSubmitting = false;
        });
      });
  }

  restartRoom() {
    if (this.leaving) return;
    if (!this.gameOver || this.restartSubmitting) return;
    this.restartSubmitting = true;
    this.statusText = '正在发送再战确认…';
    this.runtime.manager.render();

    this.runtime.cloud
      .restartRoom(this.roomId)
      .then((result) => {
        if (!this.active || !result) return;
        this.restartReady = !result.restarted;
        this.statusText = result.restarted ? '新一局开始' : '已准备，等待对手确认';
      })
      .catch((err) => {
        this.statusText = toUserMessage(err, '再来一局失败');
      })
      .finally(() => {
        this.restartSubmitting = false;
        if (this.active) this.loadRoom();
      });
  }

  confirmSurrender() {
    if (this.leaving) return;
    if (this.gameOver || this.surrenderSubmitting) return;
    const wxApi = this.runtime.wx;
    if (!wxApi || typeof wxApi.showModal !== 'function') {
      this.submitSurrender();
      return;
    }
    wxApi.showModal({
      title: '确认投降？',
      content: '投降后本局立即结束，对手将获得胜利。',
      confirmText: '确认投降',
      confirmColor: COLORS.danger,
      cancelText: '继续对局',
      success: (result) => {
        if (result && result.confirm) this.submitSurrender();
      },
    });
  }

  submitSurrender() {
    if (this.leaving) return;
    if (this.gameOver || this.surrenderSubmitting) return;
    this.surrenderSubmitting = true;
    this.syncing = true;
    this.boardLocked = true;
    this.statusText = '正在确认投降…';
    this.runtime.manager.render();
    this.runtime.cloud
      .surrenderRoom(this.roomId)
      .catch((err) => {
        this.statusText = toUserMessage(err, '投降失败');
      })
      .finally(() => {
        this.surrenderSubmitting = false;
        if (this.active) this.loadRoom();
      });
  }

  async leaveToHome() {
    if (this.leaving || this.exited) return;
    this.leaving = true;
    this.boardLocked = true;
    this.clearWatch();
    this.clearRestart();
    this.runtime.manager.render();
    let failed = false;
    try {
      await this.runtime.cloud.leaveRoom(this.roomId);
      roomSession.clear(this.runtime.wx, this.roomId);
      if (!this.exited) this.runtime.manager.go('home');
    } catch (err) {
      failed = true;
      this.statusText = '退出未确认，请检查网络后重试';
      if (!this.exited && this.active) showToast(this.runtime.wx, this.statusText);
    } finally {
      this.leaving = false;
      if (failed && !this.exited && this.active) this.onResume();
    }
  }
}

function normalizeBoard(nextBoard) {
  return Array.from({ length: board.BOARD_SIZE }, (_, row) => {
    const sourceRow = Array.isArray(nextBoard[row]) ? nextBoard[row] : [];
    return Array.from({ length: board.BOARD_SIZE }, (_, col) => {
      const piece = sourceRow[col];
      return piece === board.BLACK || piece === board.WHITE ? piece : board.EMPTY;
    });
  });
}

function createDisplayPlayer(roomPlayer, fallbackNickname) {
  const source = roomPlayer || {};
  const avatarUrl = /^https:\/\//i.test(String(source.avatarUrl || ''))
    ? String(source.avatarUrl)
    : '';
  return {
    nickname: String(source.nickname || fallbackNickname || '棋友')
      .trim()
      .slice(0, 12),
    avatarMode: avatarUrl ? 'wechat' : 'jade',
    wechatAvatarUrl: avatarUrl,
  };
}

function drawPlayerStone(ctx, x, y, role) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = role === 'host' ? '#1D2321' : '#F8F8F5';
  ctx.fill();
  ctx.strokeStyle = role === 'host' ? '#0C0F0E' : '#B8BFBB';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPlayerRibbon(ctx, options) {
  const { x, y, width, height, isActive, align } = options;
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, 18);
  ctx.fillStyle = isActive ? COLORS.jadeSoft : 'rgba(255, 255, 255, 0.82)';
  ctx.fill();
  ctx.strokeStyle = isActive ? 'rgba(20, 56, 43, 0.42)' : COLORS.line;
  ctx.lineWidth = isActive ? 1.5 : 1;
  ctx.stroke();

  if (isActive) {
    ctx.beginPath();
    const fromX = align === 'left' ? x + 18 : x + width - 18;
    const toX = align === 'left' ? x + width - 10 : x + 10;
    ctx.moveTo(fromX, y + height);
    ctx.lineTo(toX, y + height);
    ctx.strokeStyle = COLORS.jade;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

function drawAvatarHalo(ctx, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.jade;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(20, 56, 43, 0.28)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}

function drawFittedPlayerName(ctx, nickname, x, y, maxWidth, align) {
  const name = String(nickname || '棋友').trim() || '棋友';
  const family = '"PingFang SC", "Microsoft YaHei", sans-serif';
  let fontSize = 15;
  let measuredWidth = measureTextWidth(ctx, name, fontSize);
  while (fontSize > 11 && measuredWidth > maxWidth) {
    fontSize -= 1;
    measuredWidth = measureTextWidth(ctx, name, fontSize);
  }
  const horizontalScale = measuredWidth > maxWidth ? maxWidth / measuredWidth : 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(horizontalScale, 1);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 ${fontSize}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 0, 0);
  ctx.restore();
}

function measureTextWidth(ctx, text, size) {
  ctx.save();
  ctx.font = `700 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  const width =
    typeof ctx.measureText === 'function'
      ? ctx.measureText(text).width
      : String(text).length * size;
  ctx.restore();
  return Math.max(width, 1);
}

function drawDuelMedallion(ctx, x, y) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.surface;
  ctx.shadowColor = 'rgba(83, 61, 25, 0.12)';
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = COLORS.gold;
  ctx.font = '800 9px "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', x, y);
  ctx.restore();
}

function drawRoomHeading(ctx, text, x, y) {
  ctx.save();
  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = '700 14px ui-monospace, "SFMono-Regular", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTurnMarker(ctx, x, y) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.jade;
  ctx.shadowColor = 'rgba(20, 56, 43, 0.25)';
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.restore();
}

module.exports = OnlineGameScene;
