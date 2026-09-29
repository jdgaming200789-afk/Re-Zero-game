# Re:Zero - Pleiades — Development Status

_Last updated: end of Phase 1._

## Current phase

**Phase 1 complete → starting Phase 2** (Blender environment kit, Watchtower prototype, lighting, materials, basic VFX).

## Platform decision (Phase 0)

The Unity MCP and Blender MCP servers configured in the Claude Desktop app run on
the user's machine and are **not reachable from the cloud session** this project is
developed in (no Unity install, no GPU). Following the brief's fallback, the game is
built for the **browser**, with every original requirement kept:

| Brief (Unity)                | This project (browser)                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| Unity engine / URP-HDRP      | Three.js r186 (WebGL2) + pmndrs `postprocessing` + N8AO           |
| PhysX / CharacterController  | Rapier 0.21 (WASM) + its kinematic character controller          |
| C# MonoBehaviours            | TypeScript `Entity` + `Component` lifecycle (`src/core/ecs`)       |
| ScriptableObjects            | Typed data definition modules in `src/data` (added from Phase 3)   |
| Scenes / additive loading    | `Area` modules, lazily imported (code-split) by `SceneManager`     |
| Addressables                 | `AssetManager` + keyed `manifest.ts`, ref-counted                  |
| Input System                 | `InputManager` action maps with contexts, rebinding, gamepad       |
| Blender via MCP              | Real Blender 4.2 (`bpy` module) run headlessly by `tools/blender`  |
| "Run the game / screenshots" | Playwright + Chromium harness in `tools/browser` (see Testing)     |

## Completed systems

### Core (`src/core`)
- `EventBus` — typed pub/sub; the whole event contract lives in `GameEvents.ts`. Listener errors are isolated; safe removal during emit.
- `Entity` / `Component` / `World` — Unity-like lifecycle (`onAttach/onStart/fixedUpdate/update/lateUpdate/onDetach`). Components only enter update lists for hooks they implement (no empty Update calls). Entities are scoped (per area) for clean unloading.
- `Time` — scaled/unscaled time, hit-stop, slow motion, fixed-step interpolation alpha.
- `Scheduler` — game-time waits and tweens. Gameplay sequences never use `setTimeout`, so they pause with the game and step deterministically in tests.
- `StateMachine`, `ObjectPool`, math utilities (springs, `smoothDamp`, easing, seeded RNG, noise).

### Settings (`src/settings`)
- Low / Medium / High / Ultra presets plus separate resolution scale, shadow quality, texture quality, effects, post-processing, view distance, anti-aliasing, AO, bloom, volumetrics, FOV.
- Audio buses, gameplay options (sensitivity, invert Y, camera shake, text speed, auto-advance, difficulty, toggle sprint), rebinding overrides.
- Persisted separately from saves via `SafeStorage` (never throws; in-memory fallback when storage is blocked). Unknown/missing keys merge with defaults.

### Rendering (`src/render`)
- `RenderPipeline`: HDR half-float chain → N8AO ambient occlusion → exposure (eye adaptation) → bloom → AgX tone mapping → custom color grade (lift/gamma/gain, temperature, saturation, "drain" for dread/Return by Death, fades) → vignette, chromatic aberration pulses, film grain → SMAA/FXAA. Depth of field pass for cinematic shots.
- Grades blend over time (area moods, story beats). Settings rebuild the chain live.

### Input (`src/input`)
- Action-based, context-filtered (gameplay / combat / ui / dialogue / cinematic / global).
- Keyboard, mouse (pointer lock with drag-look fallback), gamepad (standard mapping, radial dead zones, response curve).
- Input buffering (`buffered(action, window)`) and consumption (shared physical keys resolve cleanly, e.g. `E` interact vs. `E` tab-next).
- Rebindable actions, device-aware glyph labels.

### Physics (`src/physics`)
- Rapier wrapper with collision layers, static trimesh/box/cylinder/heightfield colliders, sensor triggers with enter/exit callbacks, raycasts, sphere casts, overlap queries, line-of-sight, debug rendering.

### Player & camera
- `CharacterMotor`: kinematic capsule, gravity, step-up (0.38 m), slope limit (50°), ground snapping, coyote time, fall tracking, landing events, render interpolation between 60 Hz physics steps.
- `PlayerController`: camera-relative movement that turns along arcs (speed-dependent turn rate, braking on sharp reversals), walk / run / sprint with stamina and exhaustion (Subaru is not an athlete: sprint drains, running slows when winded), buffered jump, contextual Space (jump in exploration, dodge in combat), lock-on strafing, scripted `moveTo`/`faceTowards` for interactions and cutscenes, control locks.
- `ThirdPersonCamera`: over-the-shoulder follow with separate horizontal/vertical smoothing, sphere-cast boom collision (fast in, slow out), shoulder collision, shoulder swap, zoom, profiles (exploration / interior / combat / aim), gentle auto-recenter, lock-on framing, speed-dependent FOV.
- `CameraDirector`: cuts and eased blends to authored shots (for dialogue/cinematics), drift and handheld sway, depth-of-field hookup, trauma-based shake, seamless blend back into gameplay.

### Interaction (`src/interaction`)
- `Interactable` component: kinds (door, read, inspect, pickup, talk, mechanism, lore, clue, treasure, use, rest), contextual verbs, approach points, contextual animation ids, hold-to-interact, one-shot, conditions with "locked" messages, priorities.
- `InteractionManager`: scoring by distance + character facing + camera centring with hysteresis and line-of-sight. Runs the full sequence: lock control → walk to approach point → turn → contextual animation → handler at the animation contact moment → release.
- World-anchored prompt with icon, verb, label and hold ring; examine card; barks; toasts.

### Scenes, assets, world state
- `SceneManager` + `Area`: async, code-split area loading with fade/loading screen, atmosphere profiles (background, environment, fog, grade, exposure, music state, tension), spawn points, shader pre-compilation, complete teardown.
- `AssetManager`: keyed, ref-counted loading for glTF, textures, audio, JSON.
- `WorldStateManager`: namespaced flags. `know.*` (Subaru's knowledge) and `meta.*` survive Return by Death; everything else rewinds to the checkpoint snapshot. Strict key/value validation to prevent save corruption.

### UI (`src/ui`)
- DOM layer stack (world / hud / dialogue / screens / overlay / debug) with the game's own visual language (night-sky panels, pale-gold hairlines, Cinzel/Cormorant/Noto type). No default widgets.

### Developer tools (`src/debug`)
- Console (`` ` `` or F1; only when running the dev server or with `?dev=1`): `help, tp, area, flag, flags, fps, physics, timescale, quality, pos`. Systems register their own commands.
- Dev gym test area (`?area=dev_gym`): stairs, ramps (walkable/unwalkable), ledge, pillar field, tight corridor, door, book, pickup, hold lever + gate, conditionally locked chest.

## Testing
- `npm run typecheck` — strict TypeScript.
- `npm test` — Vitest unit tests (event bus, flag scoping/rewind, snapshot validation, scheduler, FSM, math). **13/13 passing.**
- `npm run smoke` — Playwright drives the real game in Chromium and asserts on state. **13/13 checks passing, 0 console errors** (walk, sprint/stamina, stairs, jump/land, slope limit, corridor camera, focus + read, hold lever → gate, door → walk through).
  - The container has no GPU, so the harness steps the simulation at a fixed 60 Hz and renders only for screenshots (`game.advanceAsync`). Screenshots go to `test-results/`.

## Systems in progress
- None mid-flight. Phase 2 starts next.

## Known issues
- The Phase 1 player body is a temporary stand-in (`PlaceholderVisual`) implementing the real `CharacterVisual` interface; it is replaced by the anime character framework in Phase 3.
- Real-time frame rate cannot be measured in this container (software rendering). Performance numbers must be taken on real hardware.

## Next tasks
1. Blender pipeline: modular Watchtower kit (walls, arches, pillars, stairs, balustrades, floors, bookshelves, props) with bevels, UVs, LODs and collision proxies → glTF.
2. Baked PBR textures (sandstone, marble, worn wood, bronze) from Blender procedural materials.
3. Watchtower vertical-slice areas built from the kit, per-zone lighting, fog, dust, light shafts.

## Technical decisions
- **Browser over Unity** — forced by the environment (see above); architecture mirrors Unity idioms so concepts transfer.
- **Fixed 60 Hz physics + interpolation** — stable character movement independent of frame rate.
- **Game-time scheduler for all sequences** — pause safety and deterministic tests.
- **Flags are primitives only, namespaced by persistence scope** — Return by Death is a scoped restore, and saves cannot alias live objects.
- **DOM UI** — best typography and layout quality in a browser; world-anchored elements are projected each frame.

## Performance concerns
- N8AO and SMAA are the most expensive passes; both scale with quality presets (AO half-res, disabled on Low).
- Shadow-casting local lights must stay within the per-tier budget (`SHADOW_LIGHT_BUDGET`).
- Trimesh colliders for large kit pieces should use simplified collision proxies (Phase 2 exports them).
