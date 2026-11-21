import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, makeScene, drawWithMotion } from '../visual-review.js';
import { Renderer } from '../renderer.js';

test('fixture creates independent, deterministic renderer states', () => {
  const options = { ...DEFAULTS, heading: 90, cannon: -180, bank: .3, pitch: -.2,
    vx: 270, vy: -30, heat: 1, muzzle: true, flare: true, dash: true,
    explosion: true, hit: true, round: true, tracer: true };
  const first = makeScene(options), second = makeScene(options);
  assert.deepEqual(first, second);
  assert.equal(first.player.angle, Math.PI / 2);
  assert.equal(first.player.cannonAngle, -Math.PI);
  assert.equal(first.player.overheated, true);
  assert.ok(first.player.muzzle > 0 && first.player.muzzleSmoke > 0);
  assert.equal(first.player.dashTime, 1);
  assert.equal(first.particles.length, 5);
  assert.equal(first.player.invulnerable, .5);
  assert.equal(first.bullets[0].tracer, true);
  assert.equal(first.explosions.length, 1);
  first.particles[0].x = 0;
  assert.notEqual(first.particles[0].x, second.particles[0].x);
});

test('fixture uses Renderer.draw and restores the motion query, including on failure', () => {
  const original = query => ({ matches: query === 'other' });
  const host = { matchMedia: original };
  const scene = makeScene(DEFAULTS);
  let seen = false;
  drawWithMotion({ draw(g, dt) {
    assert.equal(g, scene);
    assert.equal(dt, 0);
    assert.equal(host.matchMedia('(prefers-reduced-motion: reduce)').matches, true);
    assert.equal(host.matchMedia('other').matches, true);
    seen = true;
  } }, scene, true, host);
  assert.ok(seen);
  assert.equal(host.matchMedia, original);
  assert.throws(() => drawWithMotion({ draw() { throw Error('draw failed'); } }, scene, false, host), /draw failed/);
  assert.equal(host.matchMedia, original);
});

test('real renderer draws an enabled fixture scene without random state', () => {
  const gradient = { addColorStop() {} };
  const context = () => new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
      return () => {};
    }
  });
  const doc = { createElement: () => ({ getContext: context }) };
  const renderer = new Renderer({ getContext: context, ownerDocument: doc }, { effects: true, shake: false });
  renderer.scale = 1;
  renderer.terrain = {};
  const scene = makeScene({ ...DEFAULTS, muzzle: true, flare: true, dash: true, explosion: true });
  const before = structuredClone(scene);
  const random = Math.random;
  const originalMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  Math.random = () => { throw Error('unexpected randomness'); };
  try { drawWithMotion(renderer, scene, false, globalThis); }
  finally {
    Math.random = random;
    if (originalMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = originalMedia;
  }
  assert.deepEqual(scene, before);
});
