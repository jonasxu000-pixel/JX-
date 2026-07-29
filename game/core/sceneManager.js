const InputManager = require('./inputManager');
const { drawAppBackground } = require('../renderers/cardRenderer');

class SceneManager {
  constructor(runtime) {
    this.runtime = runtime;
    this.input = new InputManager();
    this.sceneTypes = {};
    this.current = null;
    this.suspended = false;
    this.foregroundFrame = null;
    this.foregroundTimer = null;
  }

  register(name, SceneType) {
    this.sceneTypes[name] = SceneType;
  }

  go(name, params) {
    const SceneType = this.sceneTypes[name];
    if (!SceneType) throw new Error(`Unknown scene: ${name}`);

    this.input.handleTouchCancel();
    if (this.current && this.current.onExit) {
      this.current.onExit();
    }

    this.current = new SceneType({
      ...this.runtime,
      manager: this,
    }, params || {});

    if (this.current.onEnter) {
      this.current.onEnter(params || {});
    }

    this.render();
  }

  render() {
    const { ctx, width, height } = this.runtime;
    this.input.beginFrame();
    ctx.clearRect(0, 0, width, height);
    drawAppBackground(ctx, width, height);

    if (this.current && this.current.render) {
      this.current.render(ctx, this.input);
    }
  }

  getTouchPoint(event, changed) {
    if (!event) return null;
    const preferred = changed ? event.changedTouches : event.touches;
    const fallback = changed ? event.touches : event.changedTouches;
    const touch = (preferred && preferred[0]) || (fallback && fallback[0]);
    if (!touch) return null;
    return {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  handleTouchStart(event) {
    const point = this.getTouchPoint(event, false);
    if (!point) return;

    if (this.input.handleTouchStart(point.x, point.y)) {
      this.render();
      return;
    }

    if (this.current && this.current.handleTouch) {
      this.current.handleTouch(point.x, point.y);
    }
  }

  handleTouchMove(event) {
    if (!this.input.hasActiveTouch()) return;
    const point = this.getTouchPoint(event, false);
    if (!point) return;
    if (this.input.handleTouchMove(point.x, point.y)) {
      this.render();
    }
  }

  handleTouchEnd(event) {
    if (!this.input.hasActiveTouch()) return;
    const point = this.getTouchPoint(event, true);
    if (!point) {
      this.handleTouchCancel();
      return;
    }

    const result = this.input.handleTouchEnd(point.x, point.y);
    if (!result.captured) return;

    // 先清除按压态，再执行页面跳转或业务操作。
    this.render();
    if (result.onTap) {
      result.onTap({ x: point.x, y: point.y });
    }
  }

  handleTouchCancel() {
    if (this.input.handleTouchCancel()) {
      this.render();
    }
  }

  // 保留旧入口供现有测试和内部调用使用，语义仍是触摸开始。
  handleTouch(event) {
    this.handleTouchStart(event);
  }

  resume() {
    this.wake();
    this.input.handleTouchCancel();
    if (this.current && this.current.onResume) {
      this.current.onResume();
    }
    this.render();
    this.redrawAfterForeground();
  }

  wake() {
    this.suspended = false;
  }

  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    this.clearForegroundRedraw();
    this.input.handleTouchCancel();
    if (this.current && this.current.onHide) {
      this.current.onHide();
    }
  }

  redrawAfterForeground() {
    this.clearForegroundRedraw();
    const redraw = () => {
      if (!this.suspended) this.render();
    };
    const { canvas } = this.runtime;

    // 真机回前台时 Canvas 首帧可能仍未恢复；下一动画帧与短延时各补画一次。
    if (canvas && typeof canvas.requestAnimationFrame === 'function') {
      this.foregroundFrame = canvas.requestAnimationFrame(() => {
        this.foregroundFrame = null;
        redraw();
      });
    }
    this.foregroundTimer = setTimeout(() => {
      this.foregroundTimer = null;
      redraw();
    }, 80);
  }

  clearForegroundRedraw() {
    const { canvas } = this.runtime;
    if (this.foregroundFrame !== null
      && canvas
      && typeof canvas.cancelAnimationFrame === 'function') {
      canvas.cancelAnimationFrame(this.foregroundFrame);
    }
    this.foregroundFrame = null;
    if (this.foregroundTimer !== null) {
      clearTimeout(this.foregroundTimer);
      this.foregroundTimer = null;
    }
  }
}

module.exports = SceneManager;
