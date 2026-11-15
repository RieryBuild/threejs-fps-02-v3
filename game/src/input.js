// Keyboard and mouse input: a key set, a look delta queue and a pressed
// queue the fixed step consumes. Pointer lock is requested by the play
// button; the game never reads the mouse outside the lock. Right mouse is
// aim-down-sights; it is tracked beside the trigger.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let aiming = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
    aiming = false;
  });
  document.addEventListener('pointerlockchange', () => {
    onLockChange(document.pointerLockElement === canvas);
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    lookX += e.movementX;
    lookY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
    if (e.button === 2) aiming = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    state: { keys, firing: false, aiming: false },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    syncFiring() {
      const locked = document.pointerLockElement === canvas;
      this.state.firing = firing && locked;
      this.state.aiming = aiming && locked;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
  };
}
