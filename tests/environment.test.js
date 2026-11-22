import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentFor, environmentGeometry, generateProps, TIME_OF_DAY } from '../environment.js';

test('layout defaults can be overridden by a level-supplied environment', () => {
  assert.equal(environmentFor({ layout: 'valley' }).weather.type, 'fog');
  const custom = environmentFor({ layout: 'valley', environment: { time: 'night', weather: { type: 'rain', intensity: 2 }, compounds: [] } });
  assert.equal(custom.time, 'night');
  assert.ok(TIME_OF_DAY[custom.time]);
  assert.equal(custom.weather.type, 'rain');
  assert.equal(custom.weather.intensity, 1);
  assert.equal(custom.compounds.length, 0);
  assert.equal(environmentFor({ layout: 'desert', environment: { time: 'bogus', weather: { type: 'acid' } } }).weather.type, 'none');
});

test('props are deterministic per seed and avoid water, the landing pad and the world edge', () => {
  for (const layout of ['desert', 'valley', 'canyon']) {
    const env = environmentFor({ layout }), W = 1600, H = 900;
    const a = generateProps(env, W, H, 11), b = generateProps(env, W, H, 11);
    assert.deepEqual(a, b);
    assert.ok(a.length > 0);
    const geometry = environmentGeometry(env, W, H);
    for (const prop of a) {
      assert.ok(prop.x > 50 && prop.x < W - 50 && prop.y > 110 && prop.y < H - 50);
      assert.ok(Math.hypot(prop.x - geometry.landing.x, prop.y - geometry.landing.y) > 135);
    }
  }
});

test('valley road crosses the river on a bridge', () => {
  const geometry = environmentGeometry(environmentFor({ layout: 'valley' }), 1600, 900);
  assert.equal(geometry.bridges.length, 1);
});
