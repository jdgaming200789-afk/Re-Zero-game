# Re:Zero - Pleiades

A third-person action-adventure RPG adaptation of *Re:Zero* Arc 6 — the Pleiades
Watchtower — built for the browser with Three.js, Rapier and a headless Blender
asset pipeline.

> Fan project. Re:Zero and its characters belong to Tappei Nagatsuki, Shinichirou
> Otsuka and Kadokawa.

## Running

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

URL parameters: `?area=<id>&spawn=<id>` start in a given area; `?dev=1` enables the
developer console in production builds.

### Controls (keyboard & mouse)

| Action            | Key            | Action             | Key        |
| ----------------- | -------------- | ------------------ | ---------- |
| Move              | WASD           | Interact           | E (hold for mechanisms) |
| Look              | Mouse          | Walk toggle        | C          |
| Sprint            | Shift          | Jump / Dodge (combat) | Space   |
| Swap shoulder     | V              | Zoom               | Mouse wheel |
| Developer console | ` or F1        |                    |            |

Gamepads (standard mapping) are supported throughout.

## Development

```bash
npm run typecheck    # strict TypeScript
npm test             # unit tests (Vitest)
npm run smoke        # drives the real game in Chromium and asserts on state
```

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for the current phase, completed
systems, known issues and technical decisions.

## Layout

```
src/
  core/        event bus, entity/component world, time, scheduler, math
  game/        composition root and main loop
  settings/    player settings and quality presets
  input/       action maps, bindings, gamepad
  physics/     Rapier wrapper, layers, queries
  render/      renderer, post-processing chain, color grading
  camera/      follow camera, director (shots/blends), shake
  characters/  motor, visual contract (anime characters from Phase 3)
  player/      player controller
  interaction/ interactables and interaction flow
  scene/       areas, scene manager, level builder
  world/       story flags and world state
  assets/      keyed asset loading
  ui/          DOM UI layers and widgets
  debug/       developer console and commands
  areas/       area modules (lazily loaded)
tools/
  browser/     Playwright harness and smoke tests
  blender/     headless Blender asset pipeline (Phase 2)
tests/         unit tests
```
