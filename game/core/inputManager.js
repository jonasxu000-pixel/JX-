class InputManager {
  constructor() {
    this.hitAreas = [];
    this.activeTouch = null;
  }

  beginFrame() {
    this.hitAreas = [];
  }

  addHitArea(rect, onTap, disabled) {
    if (!rect || !onTap || disabled) return;
    this.hitAreas.push({
      key: this.getAreaKey(rect),
      rect,
      onTap,
    });
  }

  getAreaKey(rect) {
    return [rect.x, rect.y, rect.width, rect.height].join(':');
  }

  contains(rect, x, y) {
    return x >= rect.x
      && x <= rect.x + rect.width
      && y >= rect.y
      && y <= rect.y + rect.height;
  }

  findHitArea(x, y) {
    for (let i = this.hitAreas.length - 1; i >= 0; i -= 1) {
      const area = this.hitAreas[i];
      if (this.contains(area.rect, x, y)) return area;
    }
    return null;
  }

  findActiveArea() {
    if (!this.activeTouch) return null;
    return this.hitAreas.find(area => area.key === this.activeTouch.key) || null;
  }

  handleTouchStart(x, y) {
    const area = this.findHitArea(x, y);
    if (!area) {
      this.activeTouch = null;
      return false;
    }

    this.activeTouch = {
      key: area.key,
      inside: true,
    };
    return true;
  }

  handleTouchMove(x, y) {
    if (!this.activeTouch) return false;
    const area = this.findActiveArea();
    const inside = Boolean(area && this.contains(area.rect, x, y));
    const changed = inside !== this.activeTouch.inside;
    this.activeTouch.inside = inside;
    return changed;
  }

  handleTouchEnd(x, y) {
    if (!this.activeTouch) {
      return {
        captured: false,
        onTap: null,
      };
    }

    const area = this.findActiveArea();
    const shouldActivate = Boolean(
      area
      && this.activeTouch.inside
      && this.contains(area.rect, x, y),
    );
    const onTap = shouldActivate ? area.onTap : null;
    this.activeTouch = null;

    return {
      captured: true,
      onTap,
    };
  }

  handleTouchCancel() {
    const captured = Boolean(this.activeTouch);
    this.activeTouch = null;
    return captured;
  }

  hasActiveTouch() {
    return Boolean(this.activeTouch);
  }

  isPressed(rect) {
    return Boolean(
      this.activeTouch
      && this.activeTouch.inside
      && this.activeTouch.key === this.getAreaKey(rect),
    );
  }
}

module.exports = InputManager;
