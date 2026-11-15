// Minimap: a top-down canvas of the array — sand ground, the service road,
// the panel columns, the Control building, the pylon, the two site rings
// and a letter on each site — with live dots for the player (white), the
// HELIO attackers (amber), the SABLE defenders (teal) and the bomb (amber
// pulse). It reuses one canvas and draws from scratch each frame; the map
// is static, the dots are the only moving part.
import { PALETTE } from './palette.js';

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const minX = -34;
  const maxX = 34;
  const minZ = -25;
  const maxZ = 25;
  function px(x) { return ((x - minX) / (maxX - minX)) * W; }
  function pz(z) { return ((z - minZ) / (maxZ - minZ)) * H; }

  function drawStatic() {
    ctx.fillStyle = '#c98f56';
    ctx.fillRect(0, 0, W, H);
    // Service road.
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(px(-3), pz(-23), px(3) - px(-3), pz(23) - pz(-23));
    // Site pads.
    ctx.fillStyle = '#cfc4ae';
    ctx.fillRect(px(18), pz(-20), px(26) - px(18), pz(-12) - pz(-20));
    ctx.fillRect(px(-26), pz(-20), px(-18) - px(-26), pz(-12) - pz(-20));
    // Panel columns.
    ctx.fillStyle = '#1d4e89';
    for (const colX of [16, 24, -16, -24]) {
      for (const pz0 of [-14, -8, -2, 4, 10]) {
        ctx.fillRect(px(colX - 1.8), pz(pz0 - 1.1), px(colX + 1.8) - px(colX - 1.8), pz(pz0 + 1.1) - pz(pz0 - 1.1));
      }
    }
    // Control building with its mid gap.
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(px(-7), pz(-16), px(-1.5) - px(-7), pz(-10) - pz(-16));
    ctx.fillRect(px(1.5), pz(-16), px(7) - px(1.5), pz(-10) - pz(-16));
    // Inverter cabinets at B.
    ctx.fillStyle = '#dde2e4';
    for (const cx of [-26, -22, -18]) ctx.fillRect(px(cx - 1), pz(-20.1), px(cx + 1) - px(cx - 1), pz(-18.9) - pz(-20.1));
    // Water tank.
    ctx.beginPath();
    ctx.arc(px(-29), pz(17), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#7d848c';
    ctx.fill();
    // Pylon, east of the service road.
    ctx.fillStyle = '#3c424a';
    ctx.fillRect(px(3.9), pz(-3.1), px(6.1) - px(3.9), pz(-0.9) - pz(-3.1));
    // Site rings and letters.
    ctx.strokeStyle = '#f2a541';
    ctx.lineWidth = 2;
    for (const [sx, sz, letter] of [[22, -16, 'A'], [-22, -16, 'B']]) {
      ctx.beginPath();
      ctx.arc(px(sx), pz(sz), 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f2a541';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, px(sx), pz(sz));
    }
    // Perimeter.
    ctx.strokeStyle = 'rgba(20, 14, 10, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px(-32), pz(-23), px(32) - px(-32), pz(23) - pz(-23));
  }

  function draw(state) {
    drawStatic();
    const { player, bots, bomb, bombPlanted, time } = state;
    // Bomb: a pulsing amber dot.
    if (bomb) {
      const r = bombPlanted ? 4 + Math.sin(time * 6) * 1.5 : 3.5;
      ctx.beginPath();
      ctx.arc(px(bomb.x), pz(bomb.z), r, 0, Math.PI * 2);
      ctx.fillStyle = bombPlanted ? '#ff5a2a' : '#f2a541';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Bots: team-coloured dots with a white ring on the carrier.
    for (const bot of bots) {
      if (!bot.alive) continue;
      ctx.beginPath();
      ctx.arc(px(bot.pos.x), pz(bot.pos.z), 3, 0, Math.PI * 2);
      ctx.fillStyle = bot.team === 'attack' ? '#e08a2e' : '#3f8f9e';
      ctx.fill();
      if (bot.hasBomb) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Player: a white triangle pointing where the player looks.
    if (player) {
      const x = px(player.position.x);
      const y = pz(player.position.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-player.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  return { draw };
}
