const InputManager = require('./inputManager');
const { drawAppBackground } = require('../renderers/cardRenderer');

class SceneManager {
  constructor(runtime) {
    this.runtime = runtime;
    this.input = new InputManager();
    this.sceneTypes = {};
    this.current = null;
  }

  register(name, SceneType) {
    this.sceneTypes[name] = SceneType;
  }

  go(name, params) {
    const SceneType = this.sceneTypes[name];
    if (!SceneType) throw new Error(`Unknown scene: ${name}`);

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

  handleTouch(event) {
    const touch = event && event.touches && event.touches[0];
    if (!touch) return;

    if (this.input.handleTouch(touch.clientX, touch.clientY)) return;

    if (this.current && this.current.handleTouch) {
      this.current.handleTouch(touch.clientX, touch.clientY);
    }
  }

  resume() {
    if (this.current && this.current.onResume) {
      this.current.onResume();
    }
    this.render();
  }
}

module.exports = SceneManager;
