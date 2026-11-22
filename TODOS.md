# Environment follow-ups

Done in `feature/terrain`: water glints, weather tuning, dusk/night lamps, rain splashes and wet roads, softer secondary road, map label placement, spawn rejection in water.

## Visuals
- Time-of-day shadows: `TIME_OF_DAY[...].shadow` exists but sprite shadows still use a fixed offset.
- Vehicle headlights at night.
- More props and vegetation variety; props should look different per layout.

## Gameplay / logic
- Ground enemies stop at water on maps without a bridge. Real pathfinding (route around lakes and rivers) is not implemented.
- Hostile props: `prop.hostile` and `prop.points` exist and award score, but nothing sets `hostile` yet. Missions or generators decide which props are enemy assets.
- Enemy shells and rockets pass through props; consider cover.
- Gun and rocket hits check props only after enemies; consider the nearest hit.

## Level and mission data
- Wave mode still reads `levels.csv`; its optional `time` and `weather` columns feed `map.environment`; richer overrides (roads, compounds, density) still have no data source.
- Decide the mission/level format, then a procedural generator that emits an environment spec (roads, rivers, lakes, compounds, landing).
- `generateProps` and `environmentGeometry` are the reuse points; keep the spec in fractional coordinates.

## Tests and tooling
- Add a preview script for the baked terrain (currently ad hoc with node-canvas in /tmp).
- 6 pre-existing failing tests (audio decay, bullet tracer glow) are unrelated but should be fixed or updated.
