# Re:Zero - Pleiades — Development Status

_Last updated: end of Phase 3._

## Current phase

**Phase 3 complete → starting Phase 4** (combat foundation: Subaru's support kit, party combat identities, hit/hurt boxes, lock-on flow).

Vertical-slice design: [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md) — "The Watchtower in the Sand".

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

### Phase 2 — Environment, lighting, materials, VFX

**Asset pipeline (real Blender 4.2, headless `bpy`)** — `tools/blender`, `tools/textures`
- `gen_textures.py`: 12 tileable PBR material sets (sandstone ashlar, limestone, marble tiles, flagstone, sand, fused sand-glass, bronze, dark wood, fabric, rock, worn plaster, leather) from periodic noise/Worley generators — albedo, normal, packed AO/roughness/metalness, WebP (3.4 MB total). Seamless by construction.
- `build_kit.py`: 42-piece modular Watchtower kit — walls (plain / arched window / arched door, 4×6 m, plinth + cornice), floors, fluted columns (whole/broken/drum), arches, stairs, turned balustrades, pedestal, dry-stacked ruin walls, obelisk, fallen colossus, faceted desert rocks, bookshelf + books, table, chair, bench, bed, chest, urn, crate, rubble, brazier, wall torch, armillary sphere, lectern, banner, sage statue, dragon carriage, campfire, tent, spiral tread. Bevels, world-scale box UVs (1 UV = 1 m), angle-based smoothing, decimated LODs, and named collision proxies (`COL_<piece>_<i>_BOX|CYL|HULL`).
- `build_tower.py`: the ~420 m Watchtower exterior — plinth, four tapering tiers with buttresses, cornices, setback terraces, hundreds of window insets (some lit), the great gate (pylons, arch, lintel, gold star, approach stairs, landing), crown colonnade, bronze dome, spire and the summit star lantern; LODs + collision.
- Blender backups and caches are git-ignored; generated GLB/WebP files are committed so the game runs without Blender.

**Engine side**
- `MaterialLibrary`: resolves `M_<texture>[__variant]` names to shared PBR materials (tints, emissives, clearcoat), metre-based tiling, anisotropy from settings; self-initialising (no load races).
- `KitLibrary` + `KitBatch`: GLB kit indexing; placements become per-cell InstancedMeshes with distance-based LOD switching and Rapier colliders generated from the authored proxies. Shared geometry/materials are protected from area disposal.
- `RoundHall` procedural helpers (every tower floor is circular): ring walls, colonnades with arches, helical stairs (instanced treads + smooth ramp collider + stone parapet/stringer), gallery rings, domes with oculus, tiled floors.
- Terrain: seeded Perlin/fBm/ridged noise, zoned height function, dense collidable inner mesh + horizon skirt, 3-layer splat material (sand / sand-glass / paving) with height-aware blending, anti-tiling and world-space normal mapping; trimesh collision.
- Rendering: screen-space **height fog** with moon in-scattering (post effect, depth-reconstructed), procedural **night sky** (layered twinkling stars, Milky Way, moon, Pleiades cluster) with matching IBL, **follow-shadow** directional light with texel snapping.
- VFX (`src/vfx`): pooled GPU-point particles (dust motes, wind-blown sand streaks that follow the camera, embers, sparks, glowing motes), procedural flame cards + flickering point lights, soft volumetric light shafts, the distant churning **Sand Time** wall; one `VfxSystem` with scope-based cleanup and effects-quality scaling.

**Areas**
- `tower_foot` — the Tower's Foot at night: camp (carriage, campfire, tent), outer ruins and processional colonnade, fallen colossi, the sunken Glass Flats with sparse cover, the paved plaza with obelisks and statues, the great gate; dune boundary + the Sand Time on the horizon; first environmental-storytelling interactions (carriage/Rem, obelisk inscription, fused glass, a lost traveller's pack).
- `celaeno` — the fifth floor: 40 m rotunda with colonnade and arches, star-map dais with a giant armillary sphere under an oculus beam, moonlight through the west windows, dust, braziers marking the helical stair, gallery with balustrade, dome, sand drifts from the gate, sage statue, locked basement stair, collapsed passage; exits to the gate and (later) Alcyone.
- Dev areas: `dev_gym`, `kit_gallery` (every kit piece labelled).

### Phase 3 — Characters, animation, party

**Character pipeline (Blender, `tools/blender/characters`)**
- Humanoid generator: proportional joint layout per `BodySpec` (heads-tall, shoulder/hip/bust/limb scales), armature with normalised bone names, skin-modifier body with post-sculpt (chest plane, bust, glutes, flat soles), **modelled hands** (flattened palm, four curled fingers, thumb; slimmer for children), auto weights.
- Sculpted anime head (48×32) with jaw/chin/cheek controls, elf ears, and face metadata (UV frame for the painted face).
- Hair: swept **leaf-shaped locks** (full width, then a pointed taper) grown with gravity/curl/stiffness and kept off the scalp; varied fringes; sculpted cap snapped to the hairline; **ribbon drill curls** (Beatrice); dyed tips; long locks bound to spring-bone chains.
- Garments: zoned body materials (sleeves, cuffs, tights stripes...), flared/folded skirts with open fronts and petticoat frills, aprons, **body-draped collars** (an annulus dropped onto the rest-pose body by BVH ray casts, flaring where the body falls away), **capes** that drape over the shoulders then hang with folds and tatters, accessories (flowers, crown, hair clips, maid headdress, sheathed sword, braid, Echidna's fox scarf).
- Roster: Subaru, Emilia, Beatrice, Julius, Ram, Rem, Meili, Anastasia (with Echidna), Shaula — canon colours, hairstyles and silhouettes (29–41k tris, 23–80 bones each).

**Creature pipeline (`tools/blender/creatures`)**
- Generic builder: joint graph → skin body, named armature (`.L` nodes/bones mirrored), zone materials, rigid parts, glTF export. Specs live in `bestiary.py`.
- **Patrasche**: bipedal Diana-type land dragon — jet-black scales, gold slit eyes, crest horns, dorsal spines, separate lower jaw, digitigrade legs with claws, leather harness with gold buckles, crimson blanket draped onto the back.

**Engine (`src/characters`, `src/creatures`)**
- `HumanoidRig`: normalised bone space (arms-down virtual rest), so poses are authored once and work on every body.
- Layered procedural animation: per-character idle stances, breathing and weight shifts, fear/exhaustion blends; gait generator (walk→run→sprint with per-character style: slouch, sway, arm swing, cadence); keyed additive action clips with contact events and upper-body masking; turn leaning; look-at distributed over chest/neck/head with eye gaze for the residual; **foot IK** on uneven ground with hip drop.
- `FaceRenderer`: painted anime face (iris gradients, highlights, butterfly/dot pupils, sanpaku, tilt), expression blending, blinks, gaze, visemes for lip-sync, blush/sweat/tears; line weights thicken with distance so faces stay readable.
- Toon rendering (`AnimeMaterial`): tinted ramp shading where **cast shadows feed the ramp** (warm skin shadows, never grey), per-character environment-shadow probe for face and hair, smoothed hair normals, angel-ring highlight, rim light per area mood, inverted-hull outlines pushed back in depth (no bleed through layered hair/cloth), **dithered fade** near the camera or when a companion blocks the view of Subaru.
- Spring bones (VRM-style verlet) for hair, drills, skirts, capes, aprons and tails, with body colliders; reset on teleports.
- `CreatureVisual`: **phase-based procedural gait** (stance feet slide back at exactly body speed → no skating; swing arcs), ground raycasts, two-bone IK plus digitigrade metatarsus and level toes, body bob/sway/lean/turn roll, hip drop on slopes, neck aim with idle glances, tail sway on springs, jaw for roars/grunts, additive clips (nuzzle, roar, snort, alert, shake, lowerHead).
- `CharacterFactory` (anime humanoids and creatures behind one `CharacterVisual` interface, placeholder fallback), `ActorController` (steering, arrival, facing, animation feed; motor or ground-snapped), `ActorManager` (registry by character id).

**Party (`src/party`)**
- Membership is story state (`party.<id>` flags) so Return by Death restores the right party.
- `PartyManager`: breadcrumb trail of the path Subaru actually walked; formation slots placed along it with lateral offsets validated for walls **and level changes**; local slots at the leader's level when the path goes over a ledge; routing to the most advanced visible breadcrumb when the direct way is blocked; separation; out-of-view warps when hopelessly separated; placement on spawns/teleports; dissolve when blocking the camera.
- `FollowerBrain`: follow (match speed + catch-up) / settle (stop where comfortable, no shuffling) / idle (face Subaru, curious glances, attention on speakers and discoveries); walks off ledges after the player.
- `ChatterSystem` + `src/data/chatter.ts`: data-driven banter triggered by area entry, interactions, flags, zones, story events and lulls; conditions, required speakers present and near, once-per-loop (rewinds on death), priority interrupts; bark UI with character name colours, lip flap, everyone turning to the speaker.
- `Conditions`: shared condition language (`"flag"`, `"!flag"`, `"meta.loop >= 2"`, `"$party.emilia"`, `{all|any|not}`) for chatter now and dialogue/quests next.
- Area trigger zones (`Area.addZone` → `zone:entered/exited`).

## Testing
- `npm run typecheck` — strict TypeScript.
- `npm test` — Vitest unit tests (event bus, flag scoping/rewind, snapshot validation, scheduler, FSM, math, conditions, breadcrumb trail, character/chatter data validation). **25/25 passing.**
- `npm run smoke` — Playwright drives the real game in Chromium and asserts on state:
  - `tools/browser/smoke.mjs` (dev gym): **13/13** — walk, sprint/stamina, stairs, jump/land, slope limit, corridor camera, focus + read, hold lever → gate, door → walk through.
  - `tools/browser/areas.mjs`: **7/7** — tower_foot loads grounded, dune walking, gate prompt, gate → Celaeno, Celaeno gate → back outside, no VFX leaks across unloads. 0 console errors.
  - `tools/browser/party.mjs`: **16/16** — four companions (incl. Patrasche) spawn near Subaru, keep up while sprinting, settle and give him room, climb stairs, follow him down a ledge, are placed with him on teleport; an interaction triggers Beatrice → Subaru chatter that finishes, is remembered and does not repeat; leaving despawns cleanly.
- `npm run cast` — lineup review: every character spawned side by side plus face close-ups (`test-results/cast_*.png`).
  - Celaeno's helical stair verified climbable from floor to the 12 m gallery.
  - The container has no GPU, so the harness steps the simulation at a fixed 60 Hz and renders only for screenshots (`game.advanceAsync`). Screenshots go to `test-results/`.

## Systems in progress
- Remaining vertical-slice interiors (Alcyone living quarters + Green Room, Taygeta white room/library) are scheduled with the puzzle/exploration work (Phase 7); the kit and RoundHall helpers already cover them.
- Rem lying in the Green Room bed (she uses the `rest` stance and closed-eye face; the bed placement comes with Alcyone).
- Voice: every character has a `VoiceDef` (pitch/rate/timbre) for procedural voice blips; the audio phase will play them on `bark:play` and dialogue lines.

## Known issues
- Kit-to-terrain placement uses the analytic height function; very large pieces on steep dune faces can float slightly at one corner.
- The tower's buttresses use simple box colliders; the upper tiers have no collision (unreachable).
- Characters are modelled in an A-pose; garments that cover the shoulders (capes, capelets) can clip the upper arm when the arms swing far out.
- Belly/throat colour zones on Patrasche follow face boundaries and look slightly blocky up close.
- Party slots are path-based; in very cluttered rooms a companion may briefly take the breadcrumb route before a direct line opens. Warps only happen out of view.
- `PlaceholderVisual` remains as the fallback if a character model fails to load.
- Real-time frame rate cannot be measured in this container (software rendering). Performance numbers must be taken on real hardware.

## Next tasks
1. Phase 4 — combat foundation: health/stamina/status components, hit/hurt boxes and damage events, lock-on flow, Subaru's kit (dodge, command party, items, Shamak-style support via Beatrice), companion combat identities (Emilia ice arts, Beatrice shields/slows, Julius spirit swordplay, Ram wind, Meili taming, Echidna analysis, Patrasche mount/charge), hit-stop and camera feedback.
2. Phase 5 — enemy AI: dune jackals (quadruped creature spec + pack behaviour), the Sand Earthworm elite (vibration hunting, knowledge-based defeat), perception, threat, spawners.
3. Phase 6 — dialogue & cinematics (branching data, conditions, history, auto/skip/text speed, voice-ready), story flags and quests.

## Technical decisions
- **Textures generated in Python (numpy) rather than baked from Blender nodes** — periodic noise guarantees seamless tiling and is fully deterministic; Blender is used where it is strongest (modelling with modifiers, booleans, decimation, UVs, glTF export).
- **Post-process height fog instead of per-material fog** — applies uniformly to instanced/custom shaders and gives analytic height integration and moon in-scattering.
- **Kit instancing by spatial cell** — one draw call per piece/material/cell, with cell-level LOD switching.
- **Browser over Unity** — forced by the environment (see above); architecture mirrors Unity idioms so concepts transfer.
- **Fixed 60 Hz physics + interpolation** — stable character movement independent of frame rate.
- **Game-time scheduler for all sequences** — pause safety and deterministic tests.
- **Flags are primitives only, namespaced by persistence scope** — Return by Death is a scoped restore, and saves cannot alias live objects.
- **DOM UI** — best typography and layout quality in a browser; world-anchored elements are projected each frame.
- **Procedural animation over authored clips** — no animation source data is available in this environment; a normalised rig plus layered generators (gait, idle, IK, springs, additive keyed clips) gives every character distinct motion from data, and the `CharacterVisual` interface lets authored clips slot in later.
- **Painted faces, not blend shapes** — a canvas-rendered face texture gives crisp anime eyes/mouths with continuous expression blending and cheap lip-sync.
- **Shadows through the toon ramp** — shadowed regions take the material's shade tint (anime convention) instead of darkening towards ambient grey.
- **Party membership as flags** — the party rewinds with the world on Return by Death; spawning is a reconcile of flags → actors.
- **Creatures share the actor stack** — a land dragon is just another `CharacterVisual`, so party, chatter, dialogue and cinematics address it like any character.

## Performance concerns
- tower_foot renders ~360k triangles and ~245 draw calls at High (terrain inner mesh ~100k tris, tower ~38k). Candidates if needed: terrain LOD rings, merging static kit cells into BatchedMesh, lower-res horizon skirt.
- One shadow-casting point light (campfire) at High/Ultra only.
- N8AO and SMAA are the most expensive passes; both scale with quality presets (AO half-res, disabled on Low).
- Shadow-casting local lights must stay within the per-tier budget (`SHADOW_LIGHT_BUDGET`).
- Trimesh colliders for large kit pieces should use simplified collision proxies (Phase 2 exports them).
- Characters: ~30–41k triangles each plus an outline shell (≈2× vertex work). A full party on screen is ~300–400k triangles; candidates: outline shells dropped beyond ~25 m, LOD meshes from Blender's decimate, face texture updates throttled for distant characters (already only redrawn on change).
- Spring bones run on the CPU at 60 Hz sub-steps (≈80 joints for Emilia); fine for a party, would need culling/LOD for crowds.
