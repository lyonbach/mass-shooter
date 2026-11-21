import { Renderer } from './renderer.js';
import { mapForWave, WEAPONS } from './core.js';
import { WEAPON_MUZZLE_TIME } from './game/constants.js';

export const DEFAULTS = Object.freeze({
  heading: -90, cannon: -90, bank: 0, pitch: 0, vx: 0, vy: 0,
  heat: 0, time: .35, muzzle: false, flare: false, dash: false,
  explosion: false, hit: false, round: false, tracer: false,
  effects: true, reduced: false, enlarged: false
});

export function makeScene(options) {
  const radians = degrees => degrees * Math.PI / 180;
  const player = {
    x: 200, y: 140, angle: radians(options.heading), cannonAngle: radians(options.cannon),
    bank: options.bank, pitch: options.pitch, vx: options.vx, vy: options.vy,
    heat: options.heat, overheated: options.heat >= 1, health: 100,
    dashTime: options.dash ? 1 : 0, invulnerable: options.hit ? .5 : 0,
    muzzle: options.muzzle ? WEAPONS.gun.muzzleTime : 0,
    muzzleSmoke: options.muzzle ? WEAPON_MUZZLE_TIME * .7 : 0
  };
  const particles = [];
  if (options.flare) for (const [x, y, vx, vy, life, flarePhase] of [
    [125, 180, -110, 50, .5, 1], [110, 145, -130, 10, .35, 2],
    [140, 205, -80, 90, .7, 3]
  ]) particles.push({
    x, y, vx, vy, life, maxLife: .85, color: '#ffc866', size: 5, flare: true, flarePhase
  });
  if (options.explosion) particles.push({
    x: 300, y: 100, vx: 0, vy: 0, life: .5, maxLife: 1,
    smoke: true, size: 20, smokeVariant: 0
  });
  if (options.hit) particles.push({
    x: 245, y: 140, vx: 0, vy: 0, life: .1, maxLife: .18, size: 15, contactFlash: true
  });
  return {
    world: { width: 400, height: 280 }, camera: { x: 0, y: 0, zoom: 1 },
    state: 'playing', touch: true, visualTime: options.time, shake: 0, player,
    particles, enemies: [],
    bullets: options.round ? [{ x: 275, y: 140, vx: 980, vy: 0, friendly: true, kind: 'gun', tracer: options.tracer }] : [],
    pickups: [], decals: [], treadMarks: [],
    warnings: [], floaters: [],
    explosions: options.explosion ? [{ x: 300, y: 100, life: .6, maxLife: 1, size: 48 }] : []
  };
}

// Renderer reads the media query synchronously; restore it immediately after each draw.
export function drawWithMotion(renderer, scene, reduced, host = window) {
  const original = host.matchMedia;
  host.matchMedia = function(query) {
    if (/^\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)$/.test(query)) return { matches: reduced };
    return original.call(host, query);
  };
  try { renderer.draw(scene, 0); } finally { host.matchMedia = original; }
}

function createPanel(name, defaults) {
  const panel = document.querySelector('#panel-template').content.firstElementChild.cloneNode(true);
  panel.querySelector('h2').textContent = `Panel ${name}`;
  const canvas = panel.querySelector('canvas');
  canvas.setAttribute('aria-label', `Panel ${name} rendered helicopter`);
  const inputs = [...panel.querySelectorAll('input')];
  const settings = { effects: true, shake: false };
  const renderer = new Renderer(canvas, settings);
  let lastEffects;
  function setValues(values) {
    for (const input of inputs) {
      if (input.type === 'checkbox') input.checked = values[input.name];
      else input.value = values[input.name];
    }
    render();
  }
  function values() {
    return Object.fromEntries(inputs.map(input => [input.name, input.type === 'checkbox' ? input.checked : Number(input.value)]));
  }
  function render() {
    const options = values();
    for (const input of inputs) {
      const output = input.parentElement.querySelector('output');
      if (output) output.value = input.value;
    }
    settings.effects = options.effects;
    canvas.classList.toggle('enlarged', options.enlarged);
    if (lastEffects !== options.effects) {
      renderer.resize({ width: 400, height: 280 }, { width: 800, height: 560 }, mapForWave(1));
      lastEffects = options.effects;
    }
    drawWithMotion(renderer, makeScene(options), options.reduced);
  }
  panel.addEventListener('input', render);
  setValues(defaults);
  return { panel, values, setValues };
}

if (typeof document !== 'undefined') {
  const a = createPanel('A', DEFAULTS);
  const b = createPanel('B', { ...DEFAULTS, heading: 0, cannon: 0 });
  document.querySelector('#panels').append(a.panel, b.panel);
  document.querySelector('#copy').addEventListener('click', () => b.setValues(a.values()));
  document.querySelector('#reset').addEventListener('click', () => {
    a.setValues(DEFAULTS);
    b.setValues({ ...DEFAULTS, heading: 0, cannon: 0 });
  });
}
