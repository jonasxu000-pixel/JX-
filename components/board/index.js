/**
 * Canvas 棋盘组件
 * 职责：棋盘渲染 + 点击事件处理
 */

const board = require('../../utils/board');

Component({
  properties: {
    // 当前玩家棋子类型，由父组件传入
    currentPlayer: {
      type: Number,
      value: board.BLACK,
    },
    // 棋盘是否锁定（胜负已分后锁定）
    locked: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    canvasWidth: 0,
  },

  // 棋盘渲染配置
  _config: null,

  // 棋盘数据
  _boardState: null,

  // 落子历史记录
  _history: [],

  // Canvas 上下文
  _ctx: null,

  // 当前落子颜色——由组件自行维护，避免异步property导致回合错乱
  _currentPiece: board.BLACK,

  lifetimes: {
    attached() {
      this._boardState = board.createBoard();
      this._initCanvas();
    },
    detached() {
      this._ctx = null;
      this._boardState = null;
      this._config = null;
      this._history = [];
    },
  },

  methods: {
    /**
     * 初始化 Canvas 并绘制棋盘
     */
    _initCanvas() {
      const query = this.createSelectorQuery();
      query.select('#boardCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) return;

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;

          // 设置 Canvas 实际像素
          const width = res[0].width;
          canvas.width = width * dpr;
          canvas.height = width * dpr; // 正方形
          ctx.scale(dpr, dpr);

          this._ctx = ctx;

          // 计算渲染配置
          const padding = width * 0.08;
          const cellSize = (width - padding * 2) / (board.BOARD_SIZE - 1);
          this._config = { padding, cellSize };

          this._drawBoard(width);
        });
    },

    /**
     * 绘制棋盘背景、网格、星位
     */
    _drawBoard(canvasWidth) {
      const ctx = this._ctx;
      const { padding, cellSize } = this._config;

      this.data.canvasWidth = canvasWidth;

      // 背景色
      ctx.fillStyle = '#e8c77d';
      ctx.fillRect(0, 0, canvasWidth, canvasWidth);

      // 网格线
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 0; i < board.BOARD_SIZE; i++) {
        const pos = padding + i * cellSize;

        // 横线
        ctx.moveTo(padding, pos);
        ctx.lineTo(padding + (board.BOARD_SIZE - 1) * cellSize, pos);

        // 竖线
        ctx.moveTo(pos, padding);
        ctx.lineTo(pos, padding + (board.BOARD_SIZE - 1) * cellSize);
      }
      ctx.stroke();

      // 星位（5个）
      const starPoints = [
        [3, 3], [3, 11], [11, 3], [11, 11], [7, 7],
      ];
      ctx.fillStyle = '#8b7355';
      for (const [row, col] of starPoints) {
        ctx.beginPath();
        ctx.arc(padding + col * cellSize, padding + row * cellSize, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 重绘已有棋子
      this._drawAllPieces();

      // 标记最后一步
      this._drawLastMoveMark();
    },

    /**
     * 绘制所有已有棋子
     */
    _drawAllPieces() {
      for (let row = 0; row < board.BOARD_SIZE; row++) {
        for (let col = 0; col < board.BOARD_SIZE; col++) {
          const piece = this._boardState[row][col];
          if (piece !== board.EMPTY) {
            this._drawPiece(row, col, piece);
          }
        }
      }
    },

    /**
     * 在最后落子位置画红色标记点
     */
    _drawLastMoveMark() {
      if (this._history.length === 0) return;

      const ctx = this._ctx;
      const { padding, cellSize } = this._config;
      const last = this._history[this._history.length - 1];

      const x = padding + last.col * cellSize;
      const y = padding + last.row * cellSize;

      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
    },

    /**
     * 在指定位置绘制棋子
     */
    _drawPiece(row, col, piece) {
      const ctx = this._ctx;
      const { padding, cellSize } = this._config;

      const x = padding + col * cellSize;
      const y = padding + row * cellSize;
      const radius = cellSize * 0.42;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);

      // 棋子渐变色
      if (piece === board.BLACK) {
        const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
        grad.addColorStop(0, '#555');
        grad.addColorStop(1, '#111');
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, '#ccc');
        ctx.fillStyle = grad;
      }
      ctx.fill();
    },

    /**
     * 处理 Canvas 点击事件
     */
    _onTap(e) {
      if (this.data.locked) return;

      const { x, y } = e.detail;
      const grid = board.pxToGrid(x, y, this._config);

      if (!grid) return;

      const { row, col } = grid;
      if (this._boardState[row][col] !== board.EMPTY) return;

      // 使用组件内部维护的回合状态，避免异步property导致颜色错乱
      const piece = this._currentPiece;
      const nextPiece = piece === board.BLACK ? board.WHITE : board.BLACK;

      // 落子
      this._boardState[row][col] = piece;
      this._drawPiece(row, col, piece);

      // 记录到历史
      this._history.push({ row, col, piece });

      // 落子后立刻切换回合，确保下次点击用正确颜色
      this._currentPiece = nextPiece;

      // 标记最后一步（清除旧标记，画新标记）
      this._drawLastMoveMark();

      // 检测胜负
      const isWin = board.checkWin(this._boardState, row, col, piece);
      if (isWin) {
        this.setData({ locked: true });
        this.triggerEvent('onWin', { row, col, piece });
      } else {
        // 通知父组件切换玩家
        this.triggerEvent('onPlace', { row, col, piece });
      }
    },

    /**
     * 悔棋：撤销上一步落子
     * @returns {object|null} 被撤销的落子信息 {row, col, piece}，无棋可悔返回null
     */
    undo() {
      if (this._history.length === 0) return null;
      if (this.data.locked) return null;

      const last = this._history.pop();
      this._boardState[last.row][last.col] = board.EMPTY;

      // 回退到撤销那一手的执棋方
      this._currentPiece = last.piece;

      // 重绘整个棋盘（避免Canvas擦除不干净）
      this._drawBoard(this.data.canvasWidth);

      return last;
    },

    /**
     * 是否可以悔棋
     */
    canUndo() {
      return this._history.length > 0;
    },

    /**
     * 重置棋盘
     */
    resetBoard() {
      this._boardState = board.createBoard();
      this._history = [];
      this._currentPiece = board.BLACK;
      this.setData({ locked: false });
      this._drawBoard(this.data.canvasWidth);
    },

    /**
     * 获取当前棋盘状态
     */
    getBoardState() {
      return this._boardState;
    },
  },
});
