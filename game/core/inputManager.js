class InputManager {
  constructor() {
    this.hitAreas = [];
  }

  beginFrame() {
    this.hitAreas = [];
  }

  addHitArea(rect, onTap, disabled) {
    if (!rect || !onTap || disabled) return;
    this.hitAreas.push({ rect, onTap });
  }

  handleTouch(x, y) {
    for (let i = this.hitAreas.length - 1; i >= 0; i -= 1) {
      const { rect, onTap } = this.hitAreas[i];
      const inside = x >= rect.x
        && x <= rect.x + rect.width
        && y >= rect.y
        && y <= rect.y + rect.height;
      if (inside) {
        onTap({ x, y });
        return true;
      }
    }
    return false;
  }
}

module.exports = InputManager;
