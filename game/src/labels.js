// Overhead nameplates: a canvas texture on a sprite, one per bot, in the
// bot's team colour. The sprite is depth-tested, so a name never shows
// through a wall, and it scales with distance like the rest of the world.
import * as THREE from 'three';

export function makeNameSprite(name, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = name.toUpperCase();
  const w = g.measureText(text).width + 24;
  const css = `#${colorHex.toString(16).padStart(6, '0')}`;
  g.fillStyle = 'rgba(12, 10, 16, 0.72)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 42, 10);
  g.fill();
  g.fillStyle = css;
  g.fillText(text, 128, 32);
  g.strokeStyle = css;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 42, 10);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false,
  }));
  sprite.scale.set(1.7, 0.42, 1);
  sprite.raycast = () => {}; // bullets pass through the nameplate
  return sprite;
}
