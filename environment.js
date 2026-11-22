import { seededRandom, clamp } from './core.js';

// An environment describes everything about a battlefield except the enemies:
// lighting, weather, terrain detail, water, roads, compounds and props.
// Coordinates are fractions of the world size so any mode (waves, missions or a
// future generator) can supply its own spec through `map.environment`.
// Missing fields fall back to the per-layout defaults below.
export const TIME_OF_DAY = {
  day: { tint: '#fff2cc', tintAlpha: 0, vignette: .22, shadow: [6, 8] },
  dawn: { tint: '#ffb87a', tintAlpha: .11, vignette: .3, shadow: [13, 6] },
  dusk: { tint: '#ff7a4a', tintAlpha: .15, vignette: .36, shadow: [16, 9] },
  night: { tint: '#0b1a3a', tintAlpha: .3, vignette: .5, shadow: [4, 5] }
};
export const WEATHER_TYPES = ['none', 'dust', 'fog', 'rain'];
export const PROP_TYPES = {
  crate: { health: 2, radius: 11, points: 25 },
  barrel: { health: 1, radius: 8, explosive: true, points: 40 },
  sandbags: { health: 4, radius: 14, points: 15 }
};

// Solid footprints inside a compound, in its local units: [x, y, width, height]. Keep in step with Renderer.compound.
export const COMPOUND_BUILDINGS = [[-100, -82, 108, 62], [25, -80, 84, 116], [-100, 0, 62, 82], [-19, 62, 94, 48]];
export const COMPOUND_TILT = .08;
export const COMPOUND_SCALE = 1.3;

const BASE = {
  time: 'day',
  weather: { type: 'none', intensity: 0, wind: [0, 0] },
  density: { rocks: 1, vegetation: 1, craters: 1, props: 1 },
  vegetation: ['scrub'],
  landing: [.35, .37],
  compounds: [],
  roads: [],
  rivers: [],
  lakes: []
};
const MAIN_ROAD = {
  desert: [[-.05, .68], [.24, .43], [.43, .9], [.65, .61], [.84, .36], [.91, .56], [1.06, .24]],
  valley: [[-.05, .25], [.3, .15], [.45, .65], [.72, .5], [.9, .4], [.85, .75], [1.06, .8]],
  canyon: [[.2, -.09], [.6, .15], [.28, .42], [.52, .65], [.7, .85], [.83, .65], [.91, 1.11]]
};
const LAYOUTS = {
  desert: {
    time: 'day', weather: { type: 'dust', intensity: .5, wind: [38, 6] },
    density: { rocks: 1, vegetation: .8, craters: 1.2, props: 1 }, vegetation: ['scrub', 'cactus'],
    landing: [.35, .37],
    compounds: [[.8, .2, .84], [.14, .8, .72], [.52, .3, .5], [.68, .68, .48]],
    lakes: [[.2, .2, .05, .045, -.3]]
  },
  valley: {
    time: 'dawn', weather: { type: 'fog', intensity: .5, wind: [10, 3] },
    density: { rocks: .6, vegetation: 1.5, craters: .4, props: 1 }, vegetation: ['tree', 'pine', 'scrub'],
    landing: [.68, .22],
    compounds: [[.78, .76, .84], [.38, .24, .72], [.17, .7, .5], [.57, .52, .48]],
    rivers: [{ pts: [[.1, -.07], [.3, .2], [.06, .54], [.32, 1.07]], width: 105 }],
    lakes: [[.5, .86, .06, .04, .2]]
  },
  canyon: {
    time: 'dusk', weather: { type: 'dust', intensity: .35, wind: [55, 12] },
    density: { rocks: 1.6, vegetation: .5, craters: .9, props: 1 }, vegetation: ['deadtree', 'scrub'],
    landing: [.24, .68],
    compounds: [[.72, .25, .84], [.53, .82, .72], [.17, .32, .5], [.84, .65, .48]]
  }
};

// Merge order: base defaults, layout defaults, then the level's own overrides.
export function environmentFor(map) {
  const layout = LAYOUTS[map.layout] || LAYOUTS.desert;
  const own = map.environment || {};
  const env = {
    ...BASE, ...layout, ...own,
    weather: { ...BASE.weather, ...layout.weather, ...own.weather },
    density: { ...BASE.density, ...layout.density, ...own.density }
  };
  const main = { pts: MAIN_ROAD[map.layout] || MAIN_ROAD.desert, curve: true, width: 76, shoulder: 105, surface: '#343f3288', edge: '#9a96754a', centre: true };
  const secondary = { pts: [[.72, -.04], [.72, .4], [.84, .48]], curve: false, width: 39, shoulder: 53, surface: '#424c3877', edge: '#9a967530', centre: false };
  if (!own.roads) env.roads = [main, secondary];
  env.time = TIME_OF_DAY[env.time] ? env.time : 'day';
  env.weather.type = WEATHER_TYPES.includes(env.weather.type) ? env.weather.type : 'none';
  env.weather.intensity = clamp(Number(env.weather.intensity) || 0, 0, 1);
  return env;
}

const bezier = (a, b, c, d, t) => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
};
// Flattens a chain of cubic segments (curve) or a polyline into pixel points.
export function sampleShape(pts, curve, W, H, steps = 24) {
  const px = pts.map(([x, y]) => [x * W, y * H]), out = [px[0]];
  if (!curve) return px;
  for (let i = 0; i + 3 < px.length; i += 3) {
    for (let s = 1; s <= steps; s++) out.push(bezier(px[i], px[i + 1], px[i + 2], px[i + 3], s / steps));
  }
  return out;
}

function distanceToPoints(points, x, y) {
  let best = Infinity;
  for (const [px, py] of points) best = Math.min(best, Math.hypot(px - x, py - y));
  return best;
}

function intersection(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a[0] + t * r[0], y: a[1] + t * r[1], angle: Math.atan2(r[1], r[0]) } : null;
}

// Pixel-space geometry shared by the renderer (drawing) and prop placement.
export function environmentGeometry(env, W, H, seed = 1) {
  const roads = env.roads.map(road => ({ ...road, points: sampleShape(road.pts, road.curve, W, H) }));
  const rivers = env.rivers.map(river => ({ ...river, points: sampleShape(river.pts, true, W, H) }));
  const lakes = env.lakes.map(([x, y, rx, ry, rotation]) => ({ x: x * W, y: y * H, rx: rx * W, ry: ry * W, rotation }));
  const compounds = env.compounds.map(([x, y, scale]) => ({ x: x * W, y: y * H, scale: scale * COMPOUND_SCALE }));
  const landing = { x: env.landing[0] * W, y: env.landing[1] * H };
  const bridges = [];
  for (const road of roads) {
    for (const river of rivers) {
      let found = null;
      for (let i = 1; i < road.points.length && !found; i++) {
        for (let j = 1; j < river.points.length && !found; j++) {
          found = intersection(road.points[i - 1], road.points[i], river.points[j - 1], river.points[j]);
        }
      }
      if (found) bridges.push({ ...found, length: river.width + 70, width: road.width });
    }
  }
  const blocked = (x, y, { margin = 0, roads: avoidRoads = true } = {}) => {
    if (x < 50 || y < 110 || x > W - 50 || y > H - 50) return true;
    if (Math.hypot(x - landing.x, y - landing.y) < 135 + margin) return true;
    for (const compound of compounds) if (Math.hypot(x - compound.x, y - compound.y) < 150 * compound.scale + margin) return true;
    for (const lake of lakes) {
      const cos = Math.cos(-lake.rotation), sin = Math.sin(-lake.rotation), dx = x - lake.x, dy = y - lake.y;
      const lx = (dx * cos - dy * sin) / (lake.rx + margin + 10), ly = (dx * sin + dy * cos) / (lake.ry + margin + 10);
      if (lx * lx + ly * ly < 1) return true;
    }
    for (const river of rivers) if (distanceToPoints(river.points, x, y) < river.width / 2 + margin + 8) return true;
    if (avoidRoads) for (const road of roads) if (distanceToPoints(road.points, x, y) < road.shoulder / 2 + margin) return true;
    return false;
  };
  // Water that ground units cannot enter; bridge decks are walkable.
  const onBridge = (x, y) => bridges.some(b => {
    const cos = Math.cos(-b.angle), sin = Math.sin(-b.angle), dx = x - b.x, dy = y - b.y;
    return Math.abs(dx * cos - dy * sin) < b.length / 2 && Math.abs(dx * sin + dy * cos) < b.width / 2 + 4;
  });
  const inWater = (x, y, margin = 0) => {
    if (onBridge(x, y)) return false;
    for (const lake of lakes) {
      const cos = Math.cos(-lake.rotation), sin = Math.sin(-lake.rotation), dx = x - lake.x, dy = y - lake.y;
      const lx = (dx * cos - dy * sin) / (lake.rx + margin), ly = (dx * sin + dy * cos) / (lake.ry + margin);
      if (lx * lx + ly * ly < 1) return true;
    }
    return rivers.some(river => distanceToPoints(river.points, x, y) < river.width / 2 + margin);
  };
  // World-space rectangles (centre, half size, rotation) used for ground collision.
  const buildings = compounds.flatMap(k => COMPOUND_BUILDINGS.map(([bx, by, bw, bh]) => {
    const cos = Math.cos(COMPOUND_TILT), sin = Math.sin(COMPOUND_TILT), mx = bx + bw / 2, my = by + bh / 2;
    return { x: k.x + (mx * cos - my * sin) * k.scale, y: k.y + (mx * sin + my * cos) * k.scale, hw: bw / 2 * k.scale, hh: bh / 2 * k.scale, angle: COMPOUND_TILT };
  }));
  const inBuilding = (x, y, margin = 0) => buildings.some(b => {
    const cos = Math.cos(-b.angle), sin = Math.sin(-b.angle), dx = x - b.x, dy = y - b.y;
    return Math.abs(dx * cos - dy * sin) < b.hw + margin && Math.abs(dx * sin + dy * cos) < b.hh + margin;
  });
  // Trees are placed from the seed so the renderer draws them and ground units collide with the same set.
  const trees = [], woods = env.vegetation.filter(k => k === 'tree' || k === 'pine');
  if (woods.length) {
    const r = seededRandom((seed ^ 0x51ed270b) >>> 0), amount = env.density.vegetation;
    const add = (x, y, size) => {
      if (!blocked(x, y, { margin: size })) trees.push({ x, y, size, kind: woods[Math.floor(r() * woods.length)], seed: r(), radius: size * .6 });
    };
    for (let g = 0, groves = Math.round(4 * amount); g < groves; g++) {
      const cx = r() * W, cy = r() * H, spread = 70 + r() * 80, count = 6 + Math.floor(r() * 7);
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
        add(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .8, 19 + r() * 18);
      }
    }
    for (let i = 0, loners = Math.round(10 * amount); i < loners; i++) add(r() * W, r() * H, 15 + r() * 14);
    trees.sort((p, q) => p.y - q.y);
  }
  return { roads, rivers, lakes, compounds, landing, bridges, trees, buildings, blocked, inWater, inBuilding, onBridge };
}

// Props are neutral by default; a mission may set `hostile` so destroying one awards its points.
// Seeded props: clusters beside compounds and along the main road.
// The same seed always yields the same layout, so missions can replay a map.
export function generateProps(env, W, H, seed = 1) {
  const geometry = environmentGeometry(env, W, H), r = seededRandom((seed ^ 0x9e3779b9) >>> 0), props = [];
  const density = clamp(env.density.props, 0, 3);
  const place = (type, x, y, rot = r() * Math.PI * 2, avoidRoads = true) => {
    if (geometry.blocked(x, y, { margin: PROP_TYPES[type].radius, roads: avoidRoads })) return;
    if (props.some(p => Math.hypot(p.x - x, p.y - y) < p.radius + PROP_TYPES[type].radius + 3)) return;
    const stats = PROP_TYPES[type];
    props.push({ id: props.length, type, x, y, rot, health: stats.health, maxHealth: stats.health, radius: stats.radius, points: stats.points, hostile: false, destroyed: false });
  };
  for (const compound of geometry.compounds) {
    const count = Math.round((3 + r() * 3) * density);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = (150 + r() * 50) * compound.scale + 12, x = compound.x + Math.cos(a) * d, y = compound.y + Math.sin(a) * d;
      const roll = r();
      const type = roll < .4 ? 'crate' : roll < .7 ? 'barrel' : 'sandbags';
      place(type, x, y, a + Math.PI / 2);
      if (type === 'crate' && r() > .5) place('crate', x + 17, y + 3);
      if (type === 'barrel') { place('barrel', x + 15, y + 6); if (r() > .6) place('barrel', x + 5, y + 17); }
    }
  }
  const road = geometry.roads[0];
  if (road) {
    const count = Math.round(7 * density);
    for (let i = 0; i < count; i++) {
      const index = 2 + Math.floor(r() * (road.points.length - 4)), [x, y] = road.points[index], [nx, ny] = road.points[index + 1];
      const angle = Math.atan2(ny - y, nx - x), side = r() > .5 ? 1 : -1, offset = road.shoulder / 2 + 14 + r() * 16;
      const px = x - Math.sin(angle) * offset * side, py = y + Math.cos(angle) * offset * side;
      const roll = r();
      place(roll < .5 ? 'barrel' : roll < .8 ? 'crate' : 'sandbags', px, py, angle);
    }
  }
  return props;
}
