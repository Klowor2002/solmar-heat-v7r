// hud.js — DOM HUD and the circular minimap.
//
// The HUD is plain DOM (crisper than canvas text at 720p, and the
// staged screenshots read it clearly). The minimap is a 2D canvas
// redrawn each frame: roads as lines, the player as a wedge, cops
// red, the objective gold, tokens as dots — north-up, city-scaled.

import { ROADS, WORLD_EDGE } from './city.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.money = $('money');
    this.sub = $('substats');
    this.health = $('healthfill');
    this.stars = $('stars');
    this.clock = $('clock');
    this.objTitle = document.querySelector('#objective .obj-title');
    this.objText = document.querySelector('#objective .obj-text');
    this.objBox = $('objective');
    this.toast = $('toast');
    this.speed = $('speed');
    this.vehName = $('vehicle-name');
    this.cross = $('crosshair');
    this.busted = $('busted-meter');
    this.bustedFill = $('bustedfill');
    this.prompt = $('prompt');
    this.map = $('minimap').getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastMoneyText = null;   // textContent writes are layout work —
    this.lastClockText = null;   // only pay for them when text changes
  }

  show() { this.root.classList.add('on'); }
  hide() { this.root.classList.remove('on'); }

  setObjective(title, text) {
    if (!title) { this.objBox.style.display = 'none'; return; }
    this.objBox.style.display = '';
    this.objTitle.textContent = title;
    this.objText.textContent = text || '';
  }

  notify(main, sub = '', hold = 2.6) {
    this.toast.innerHTML = '';
    this.toast.append(document.createTextNode(main));
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      this.toast.append(s);
    }
    this.toast.style.opacity = 1;
    this.toastTimer = hold;
  }

  setPrompt(html) {
    if (!html) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = '';
    this.prompt.innerHTML = html;
  }

  banner(title, sub, show) {
    const b = $('banner');
    b.style.display = show ? 'flex' : 'none';
    if (show) { $('banner-title').textContent = title; $('banner-sub').textContent = sub || ''; }
  }

  update(dt, s) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.style.opacity = 0;
    }
    const moneyText = '$' + Math.max(0, Math.floor(s.money)).toLocaleString('en-US');
    if (moneyText !== this.lastMoneyText) {
      this.lastMoneyText = moneyText;
      this.money.textContent = moneyText;
    }
    this.sub.textContent = s.zone || 'SOLMAR CITY';
    this.health.style.width = Math.max(0, s.health) + '%';
    if (s.wanted !== this.lastStars) {
      this.lastStars = s.wanted;
      this.stars.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const sp = document.createElement('span');
        sp.textContent = '★';
        if (i >= s.wanted) sp.className = 'off';
        this.stars.append(sp);
      }
    }
    const mins = Math.floor(s.clockMinutes) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const clockText = `${hh}:${mm}`;
    if (clockText !== this.lastClockText) {
      this.lastClockText = clockText;
      this.clock.textContent = clockText;
    }
    const mph = Math.round(Math.abs(s.speed) * 2.24);
    this.speed.innerHTML = `${mph}<small> mph</small>`;
    this.vehName.textContent = s.vehicleName || '';
    this.cross.style.display = s.aiming ? 'block' : 'none';
    if (s.busted01 > 0.02) {
      this.busted.style.display = '';
      this.bustedFill.style.width = (s.busted01 * 100).toFixed(0) + '%';
    } else this.busted.style.display = 'none';
    this.drawMap(s);
  }

  drawMap(s) {
    const g = this.map, W = 184, C = W / 2, scale = C / (WORLD_EDGE + 46);
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#101527';
    g.fillRect(0, 0, W, W);
    const px = (x) => C + x * scale, pz = (z) => C + z * scale;
    // water + beach
    g.fillStyle = '#14486b';
    g.fillRect(px(218), 0, W, W);
    g.fillStyle = '#c9a86a';
    g.fillRect(px(186), 0, px(218) - px(186), W);
    // roads
    g.strokeStyle = '#3d4767'; g.lineWidth = 3;
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), W); g.stroke();
      g.beginPath(); g.moveTo(0, pz(r)); g.lineTo(W, pz(r)); g.stroke();
    }
    const dot = (x, z, color, r = 3) => {
      g.fillStyle = color;
      g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2); g.fill();
    };
    for (const t of s.tokens || []) dot(t.x, t.z, '#ffd94d', 2);
    for (const c of s.cops || []) dot(c.x, c.z, '#ff4d5e', 3);
    if (s.objectivePos) {
      dot(s.objectivePos.x, s.objectivePos.z, '#ffd94d', 4.5);
      g.strokeStyle = '#ffd94d'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(px(s.objectivePos.x), pz(s.objectivePos.z), 8, 0, Math.PI * 2); g.stroke();
    }
    // player wedge
    g.save();
    g.translate(px(s.playerPos.x), pz(s.playerPos.z));
    g.rotate(Math.PI - s.playerHeading); // canvas y is flipped vs the world
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }
}
