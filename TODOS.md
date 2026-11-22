# Environment follow-ups

Deferred from `feature/terrain` (environment.js, props, weather, water avoidance).

## Visuals
- Animated water glints on rivers and lakes (per-frame, effects on only, frozen under reduced motion).
- Tuning pass: weather opacity (dust is barely visible), fog density, vignette strength per time of day, road shoulder look.
- Time-of-day shadows: `TIME_OF_DAY[...].shadow` exists but sprite shadows still use a fixed offset.
- Night mode: light sources (compound lamps, vehicle headlights) and a darker terrain.
- Rain: splashes on water, wet-road darkening.
- More props and vegetation variety; props should look different per layout.
- Secondary road is a faint band and looks odd with the vignette; revisit.
- Map label placement may overlap props and compounds.

## Gameplay / logic
- Ground enemies only stop at water on maps without a bridge. Real pathfinding (route around lakes and rivers) is not implemented.
- Enemies that spawn inside water can leave but not re-enter; spawn selection should reject water for ground types without adding `Math.random` calls (tests count them).
- Hostile props: `prop.hostile` and `prop.points` exist and award score, but nothing sets `hostile` yet. Missions or generators should decide which props are enemy assets.
- Destroyed prop remains are never cleaned up or capped; fine per wave, check for long missions.
- Enemy shells and rockets pass through props; consider cover.
- Rocket/gun hit order: props are checked only after enemies; consider the nearest hit.

## Level and mission data
- Wave mode still reads `levels.csv`; `map.environment` can override the layout defaults but no data file supplies it yet.
- Decide the mission/level format, then a procedural generator that emits an environment spec (roads, rivers, lakes, compounds, landing).
- `generateProps` and `environmentGeometry` are the reuse points; keep the spec in fractional coordinates.

## Tests and tooling
- Add a visual regression or preview script for the baked terrain (currently previewed ad hoc with node-canvas in /tmp).
- 6 pre-existing failing tests (audio decay, bullet tracer glow) are unrelated but should be fixed or updated.
