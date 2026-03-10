/**
 * Input manager for the tank game.
 * Attaches keyboard listeners on document to ensure they work even when
 * the Cesium canvas has focus. Tracks mouse position for turret aiming.
 */
class InputManager {
  constructor() {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      heightUp: false,
      heightDown: false
    };

    this.mouse = {
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: 0,
      edgeRotate: 0,
      edgePitch: 0
    };

    this.callbacks = {
      fire: [],
      toggleScoreboard: [],
      speedUp: [],
      speedDown: [],
      reset: []
    };

    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;

    // Bind handlers so we can remove them on destroy
    this._onKeyDown = (e) => this.handleKeyDown(e);
    this._onKeyUp = (e) => this.handleKeyUp(e);
    this._onMouseMove = (e) => this.handleMouseMove(e);
    this._onMouseDown = (e) => this.handleMouseDown(e);
    this._onContextMenu = (e) => e.preventDefault();
    this._onResize = () => {
      this.screenWidth = window.innerWidth;
      this.screenHeight = window.innerHeight;
    };

    // Use document-level listeners to ensure we capture events
    // even when Cesium canvas has focus and would otherwise swallow them
    document.addEventListener('keydown', this._onKeyDown, true);   // capture phase
    document.addEventListener('keyup', this._onKeyUp, true);       // capture phase
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('resize', this._onResize);
  }

  handleKeyDown(e) {
    let handled = true;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':
        this.keys.forward = true; break;
      case 'KeyS': case 'ArrowDown':
        this.keys.backward = true; break;
      case 'KeyA': case 'ArrowLeft':
        this.keys.left = true; break;
      case 'KeyD': case 'ArrowRight':
        this.keys.right = true; break;
      case 'BracketRight':
        this.keys.heightUp = true; break;
      case 'BracketLeft':
        this.keys.heightDown = true; break;
      case 'KeyQ':
        this.emit('speedDown'); break;
      case 'KeyE':
        this.emit('speedUp'); break;
      case 'Space': case 'Enter':
        this.emit('fire'); break;
      case 'Tab':
        e.preventDefault();
        this.emit('toggleScoreboard'); break;
      case 'KeyR':
        this.emit('reset'); break;
      default:
        handled = false;
    }
    // Prevent Cesium from processing game keys
    if (handled) {
      e.stopPropagation();
    }
  }

  handleKeyUp(e) {
    let handled = true;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':
        this.keys.forward = false; break;
      case 'KeyS': case 'ArrowDown':
        this.keys.backward = false; break;
      case 'KeyA': case 'ArrowLeft':
        this.keys.left = false; break;
      case 'KeyD': case 'ArrowRight':
        this.keys.right = false; break;
      case 'BracketRight':
        this.keys.heightUp = false; break;
      case 'BracketLeft':
        this.keys.heightDown = false; break;
      default:
        handled = false;
    }
    if (handled) {
      e.stopPropagation();
    }
  }

  handleMouseMove(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;

    // Edge scrolling for camera orbit
    const edgeThreshold = 50;
    this.mouse.edgeRotate = 0;
    if (this.mouse.x < edgeThreshold) {
      this.mouse.edgeRotate = 1;
    } else if (this.mouse.x > this.screenWidth - edgeThreshold) {
      this.mouse.edgeRotate = -1;
    }

    this.mouse.edgePitch = 0;
    if (this.mouse.y < edgeThreshold) {
      this.mouse.edgePitch = -1;
    } else if (this.mouse.y > this.screenHeight - edgeThreshold) {
      this.mouse.edgePitch = 1;
    }
  }

  handleMouseDown(e) {
    if (e.button === 0) {
      this.emit('fire');
    }
  }

  getInput() {
    return {
      ...this.keys,
      turretDelta: 0,
      edgeRotate: this.mouse.edgeRotate || 0,
      edgePitch: this.mouse.edgePitch || 0,
      mouseX: this.mouse.x,
      mouseY: this.mouse.y
    };
  }

  clearDelta() {
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
  }

  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('keyup', this._onKeyUp, true);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('resize', this._onResize);
  }
}

export { InputManager };
