# Re:Zero - Pleiades — Development Status

_Last updated: Phase 12 (part 3) — fight frame rate and the black flashes, a walkable tower gate, punchier combat, directed conversations, canon fixes (Taygeta, Electra, the memory loss), outfits from reference._

## Current phase

**Phases 1–11 complete; Phase 12 (optimization, bug fixing, polish, final presentation) in progress.** Latest: playtest fixes (black flashes and fight frame rate, Ultra, the tower gate and mesh audit, combat feel, directed conversations), canon fixes (Taygeta's reasoning, Emilia's Electra pass and the stair of light, Subaru's memory loss) and outfits from reference. The vertical slice plays end to end from the title screen to the chapter card (`tools/browser/playthrough.mjs`); Phase 11 added the Books of the Dead in Taygeta's library and a new floor above it — Electra, and the Sword Saint's trial. Phase 12 so far: the README rewritten as the project's front page with generated screenshots (`tools/browser/screenshots.mjs`), and the heaviest combat frame cut from 4.4k draw calls to 450; then a full art pass over every character and creature against reference (tailored garments, a canon Subaru in two outfits, Reid redesigned, Patrasche and the jackals rebuilt), the sprint glitches in the party's hair and bodies fixed, and frame-rate work (consolidated models, dynamic resolution). All 14 browser suites and 72 unit tests pass.

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

### Phase 4 — Combat foundation

**Core (`src/combat`)**
- `Damage`: damage types (physical, ice, fire, wind, yin, yang, light, miasma), factions, statuses (frozen, stopped, blinded, charmed, marked, burning, slowed), pure `computeDamage` (resistances, frozen-shatter bonus, weak-point bonus, criticals, shield absorption).
- `Health` component: HP, poise/stagger with regeneration, timed and held invulnerability, shields, statuses with expiry, effective faction (charmed witchbeasts change sides), `canAct`.
- `CombatManager`: registry of damageable bodies; the damage pipeline (friendly-fire rules, events, hit-stop scaled by weight, camera shake when Subaru is involved, typed impact sparks, hit reactions, deaths); target queries (sphere, melee arc, nearest; line of sight that ignores the target's own collider); projectiles with homing and wall hits; lingering area effects; transient VFX; encounters (combat mode, camera profile, music state, victory when enemies fall, escape when leaving the arena).
- `TrainingDummy`: straw practice targets that wobble on a spring, topple and stand back up. The dev gym has a practice ring that starts an encounter when entered.

**Subaru (`SubaruCombat`)** — deliberately not a warrior:
- Whip: a three-crack combo with queued inputs and cancel windows, and a long-reach snare that staggers; the procedural lash winds back over the shoulder and snaps onto the target exactly at the animation's contact beat.
- Dive dodge with invulnerability frames (costs stamina; direction from input, hop back without input; keeps facing while locked on).
- Lock-on with target switching (left/right by screen position), strafing, camera framing.
- Through Beatrice (only when she is present; costs her lent mana): **Shamak** (a darkness cloud that blinds enemies inside) and **E·M·M** (a brief absolute barrier; weathering a blow inside it sets up a critical counter).
- Tonics (world-state inventory, so they rewind with Return by Death), party orders (focus Subaru's target / regroup around him), hit/stagger reactions, collapse on defeat (Return by Death takes over in Phase 8; a plain recovery stands in until then).

**Companions (`src/combat/companions`)** — each fights like themselves:
- `CompanionCombat` swaps the follower brain for a combat brain during encounters: target choice (Subaru's orders first; guards protect Subaru), positioning in a style-specific range band with flanking drift and separation, ability selection by situational score and cooldown, commitment to the animation, effects on the contact beat, stagger and knock-out (revived after the fight).
- **Emilia**: ice blade up close, a volley of homing ice spears (slow), El Huma ice eruption when enemies cluster (freezes).
- **Beatrice**: stays at Subaru's side; shields him when he's hurt or threatened; Minya crystals (stop).
- **Julius**: draws his sword (sheathed blade hidden), six coloured quasi-spirits orbit him, three-step sword combo, **Al Clauzeria** rainbow finisher.
- **Patrasche**: guards Subaru, tail sweep, ramming charge.
- **Ram**: Fula wind blades. **Echidna/Anastasia**: analysis marks a weak point. **Meili**: holds back until her beast-taming arrives with the witchbeasts.
- VFX: slash arcs (rainbow for Al Clauzeria), ice spikes, homing crystals and crescents, barrier bubble, darkness cloud.

**Animation**: whip combo, snare, dive, stagger, collapse, cast (Shamak), barrier stance, drinking, pointing orders; Emilia's casts and ice blade; Beatrice's point and ward; Julius's slashes, thrust and overhead finisher. Props attach to hand bones with rest-pose alignment.

**HUD (`src/ui/hud/CombatHud.ts`)**: Subaru's panel (HP with trailing damage and a striped shield overlay, stamina, Beatrice's mana), party roster with knock-out state, ability bar with cooldown sweeps and availability, lock-on chevrons, target plate with status effects, floating plates over hurt enemies, rising damage numbers coloured by element (criticals larger). Fades in for combat or when hurt; hidden in dialogue/cinematics.

### Phase 5 — Enemy AI

**Witchbeast models (Blender, `tools/blender/creatures/bestiary.py`)**
- **Dune Jackal** (10.7k tris): digitigrade hind legs, horn, torn ears, red eyes, bared teeth, a mane of spines along the back; fur/back/belly/sock colour zones.
- **Sand Earthworm** (3.8k tris): fifteen armoured segments with plates and spines, a flared maw collar, throat and three rings of teeth.
- `CreatureVisual` gained a proper quadruped gait for the jackal (phase-based walk → gallop blend, digitigrade IK, body bob/lean) and new additive clips: bite, pounce, howl, snarl, flinch, death (held on the last frame).
- `WormVisual`: segments laid along the path the head has travelled, so the worm breaches, arcs and dives as one body; segment positions double as hit points.

**Enemy framework (`src/enemies`, `src/data/enemies.ts`)**
- Data-driven `EnemyDefinition`: HP, poise, resistances, perception (sight distance, field of view, hearing, awareness rate), behaviour, circling band, flee threshold, tags; attacks with range bands, windup/recovery/cooldown, shape (arc, lunge, circle), damage, stagger and weight.
- `EnemyController` states: idle → suspicious → engaged → windup → strike → recover, plus retreat, flee, stagger, dead.
  - **Perception**: sight cones with line of sight; awareness builds with visibility and fades when nothing is seen; hearing from `EnemyManager` noise (walking 3, running 7.5, sprinting 13, combat hits 9); damage alerts instantly.
  - **Threat table**: damage dealt, proximity and visibility, decaying over time; the target only switches when someone is clearly more threatening.
  - **Telegraphed attacks**: every attack shows a ground warning (arc, lunge line or circle) whose fill grows until impact; the hit is resolved against the telegraph's area at the contact beat.
  - Blinded beasts thrash at random; charmed beasts fight for the party and run off once the fight is over; the dead play their death and are cleaned up.
- `PackDirector`: at most two jackals press the attack at once (waiting fairness so everyone gets a turn), the rest circle in evenly spaced slots and keep their distance from each other.
- `EnemyManager`: spawning, groups that alert together (a howl, then the encounter starts), noise propagation.
- `Telegraphs` (`src/combat`): shared warnings players read and companions query.
- **Companions dodge**: each companion has a dodge skill (chance to read and step out of a telegraph), so the party is strong but not untouchable. **Meili** charms witchbeasts for 12 s.

**Sand Earthworm (elite, `EarthwormController`)**
- Hunts by vibration: wanders under the sand, homes in on running and fighting, loses track of those who stand still.
- Invulnerable while burrowed. A tremor circle warns of an eruption (1.35 s), then it breaches in an arc, rears up for a few seconds, slams down along a telegraphed line and dives. Heavily resistant while surfaced — it is not meant to be out-fought.
- Surfacing starts an elite encounter with a boss bar; it raises `story:event earthworm.surfaced`, the hook the Heliosphere (light) uses on the Glass Flats in the vertical slice. Sand bursts and spray while it moves.

**HUD**: elite bar (name between ornaments, trailing damage) at the bottom centre; enemy plates.

**Dev**: `spawn <enemy|sand_earthworm> [count] [distance]` console command.

### Phase 6 — Dialogue, cinematics, quests

**Story effects & knowledge (`src/story/Effects.ts`, `src/data/knowledge.ts`)**
- One effect language shared by dialogue, cinematics and quests: set/add/clear flags, story events, learn knowledge, items, start/complete/fail quests, party join/leave, notifications. Everything changes world flags (rewinds with Return by Death) except `learn`, which writes `know.*` (Subaru keeps it).
- Knowledge entries (dangers, lore, people) with titles and texts; learning one shows a "Subaru remembers" notice.

**Dialogue (`src/story/dialogue`, `src/ui/dialogue`, `src/data/dialogues`)**
- Data: nodes with lines, choices and jumps; conditional lines, conditional redirects (branch on story state or knowledge), effects on lines/nodes/choices; choices can be hidden, shown locked with a hint, once-only, or marked **Insight** (only possible because of a previous loop — violet-gold shimmer). Every line has a voice id (`dialogue.node.index`).
- `DialogueRunner`: pure graph walker (unit-tested); `validateDialogue` checks jumps, reachability, speakers, conditions, effects and ids for all data.
- `DialogueSystem`: typewriter reveal with punctuation pauses at the player's text speed, advance (complete line → next), **Auto** (reading-time based), **Skip** (fast-forward to the next choice), **Log** (backlog of everything said and chosen), mouse and keyboard/gamepad choice selection, a voice-provider hook (recorded lines or procedural blips later), seen-line tracking.
- Staging: speakers play gestures and hold expressions, lip-flap while their line types, look at whom they address; everyone else looks at the speaker; Subaru and the partner turn to face each other.
- `ConversationCamera`: over-the-shoulder / reverse shots, singles on repeated lines, two-shots and a wide frame; the 180° rule is kept for the whole conversation; shots pull in front of walls or swing to the other side; if another character blocks the view the next coverage is tried; depth of field on the speaker.
- Conversation gestures: nod, shake head, shrug, bow, hand on chest, think, facepalm, wave, sigh, look down, laugh, fist, explain.
- `TalkSystem`: "Talk" prompts on characters, conversation chosen by story state; camp talks with every companion (Emilia, Beatrice, Julius — who unknowingly points Subaru at Orion, Ram — about the sister she doesn't remember, Echidna, Meili — who explains the worm hunts by vibration, Patrasche) with first-time and follow-up lines.

**Cinematics (`src/story/cinematic`, `src/data/cinematics.ts`)**
- Steps: fades, letterbox, chapter title cards, camera shots and blends (from/at can be coordinates, area markers or points relative to a character), follow-camera release, waits, place / walk / turn / look / gesture / expression for any character, inline lines, full conversations, effects, waiting for party spawns, music state, camera shake, conditionals and parallel groups.
- Hold Skip to fast-forward: remaining steps resolve instantly (characters land where they were going, effects still apply, choices still wait for the player), then a quick fade in — skipping never changes the story state.
- **The camp opening** (`tf.opening`): the party around the fire at the tower's foot, silhouettes against the Watchtower, title card, Subaru's thoughts, and the first-night conversation — motives (Rem asleep, Julius's lost name, the Sage), a choice of plan, and a loop-2 **Insight** option to warn everyone about the glass. Starts *The Watchtower in the Sand*.
- `NewGame`: party, story flags, the camp, then the opening revealed from black (`reveal: false` scene transitions).
- `StoryDirector`: data-driven beats (on area enter, story event, flag, interaction, zone, end of a scene) that queue instead of colliding; records visited zones as `visited.<zone>` flags.

**Quests (`src/story/quests`, `src/data/quests.ts`)**
- Quests and objectives stored in world flags (rewind with Return by Death); objectives complete themselves when their condition holds, appear in order (optional ones never block), quests can auto-start and fail; completion effects; tracked quest.
- HUD tracker (top right) with ticking/striking objectives and a centre banner for new and completed quests (waits for scenes to finish).
- **Journal** (J): Quests (in progress / completed / failed, details, objectives, hints, track), **Subaru Remembers** (knowledge by category) and the conversation log. First screen of a `ScreenManager` that pauses the game (inventory, map, settings and saves plug in next).
- *The Watchtower in the Sand*: scout the ruins → (read the obelisk) → cross the Glass Flats → enter the tower. Zones on the tower foot drive it.

**Characters**
- Hair "angel ring" now follows the crown's curvature (view-space normal) with a cool sheen — no more stripe across the fringe in close-ups.
- Blender builder: optional **zone cuts** bisect the body along planes before colour zoning so boundaries are clean lines; Subaru's jacket is now an open grey tracksuit over a white shirt without stair-stepped patches.
- Companions no longer dissolve during conversations and cutscenes (the occlusion fade is for gameplay only).

**Dev**: `newgame [skip]`, `dialogue [id]`, `cine [id]`, `quest [id] [start|complete|fail|track]`, `learn [id|all]`.

### Phase 7 — Return by Death, return points, saves, the Heliosphere

**Return points (`src/story/rbd/Checkpoints.ts`, `src/data/deaths.ts`)**
- Reaching a return point snapshots every world-scope flag (quests, party, dialogue memory, visited places, items, story beats) — never `know.*` or `meta.*`. A faint violet clock sigil names the place; the autosave is written at the same moment.
- The camp opening sets the first one ("the camp at the tower's foot, the first night"); Celaeno and the practice hall are defined for later beats. Effect `{ checkpoint: id }` lets any scene set one.

**Return by Death (`src/story/rbd/ReturnByDeath.ts`, `src/ui/overlay/WitchOverlay.ts`)**
- Any death routes here with a cause (`heliosphere`, `combat.<enemy>`, `fall`...). Wounds: time slows, the image drains of colour, Subaru collapses, the camera settles on him. Light: a white flash burns him away.
- The Witch's shadow: black tendrils with a violet glow creep in from every edge; "I love you" whispers drift over the scene and keep going over the black. A card reads *Return by Death* and the name of the return point.
- The rewind: the world flags are restored to the return point, the area is rebuilt from scratch (every enemy, pickup and one-time object back as it was), combat and effects are cleared, the party respawns whole, Subaru is restored. The loop counter, death count and last cause are kept.
- He wakes facing the people who will ask if he's all right: a white flash, chromatic shiver, a gasp (new clip), the face of someone who just died. Knowledge from the death is learned then (the Heliosphere teaches that it hunts movement and glints first). A return conversation follows: his thoughts depend on how he died; Meili and Patrasche catch the Witch's scent on him.
- **The taboo**: choosing to tell someone stops time, drains the world to grey and sends shadow hands for his heart — a faint heartbeat glow, the squeeze, the whispers rising — before letting him breathe. Available when he tries to explain himself at the camp (Insight choice) and after returning. Dialogue effects can now take time (`{ witch: 'punish' }`): the conversation hides until it passes.

**The Heliosphere (`src/areas/towerfoot/Heliosphere.ts`)**
- The star lantern at the summit (Shaula's post, 379 m up) watches the Glass Flats. Moving in the open builds its attention (faster running, faster sprinting); standing still lets it drift; the ruins on the flats are cover (readable radii around each piece — the only safe ground).
- Full attention → the summit star flares (the glint) → 1.5 s later a column of white light comes down where it last saw you: core and halo beam, a ring of light racing out over the glass, a scorch that glows and cools, sparks, a flash of light over the whole area, camera shake. Still visible under it: death (Return by Death). Hidden: it burns the empty glass and Subaru learns that stone blocks its sight.
- It also sees the Sand Earthworm: a worm breaching on the glass is struck down in a heartbeat — the answer to the elite fight, and knowledge ("lure it into the light").
- Loop 1 has no interface for any of this. Once Subaru knows, an attention meter appears at the top of the screen on the flats (Still / Exposed / Hidden), and the glint triggers a warning and a flash at the screen's edges.

**Saves (`src/save/SaveSystem.ts`)**
- Slots `auto`, `slot1`–`slot3` in local storage (in-memory fallback): every flag, the current return point and its snapshot, area, position and facing, seen dialogue lines, tracked quest, playtime and a summary for the save screen. Versioned and strictly validated — corrupt or future saves are refused, never half-loaded. Settings are never part of a save.
- Loading rebuilds the area, puts Subaru where he stood, respawns the party and restores the return point. Saving is refused mid-fight or mid-scene.

**Infrastructure**: `SceneManager.goto(..., { reload })` rebuilds an area in place; `CombatManager.reset()`; `PartyManager.respawnAll()`; `SubaruCombat.restore()`; `DialogueSystem.abort()`; cinematics wait for an open conversation instead of failing.

**Dev**: `die [cause]`, `punish`, `returnpoint [id]`, `save [slot]`, `load [slot]`, `saves`.

**Also in this phase**
- Fixed the Glass Flats mask: a sign error let negative edge noise flip the interior to "outside", so only about half of the flats were glass. It is now a proper signed distance with a melted-looking edge; the whole basin is glass.
- The exposure pass clamps HDR values below half-float range, so an extreme flash can never become Inf/NaN and blank the frame through the bloom blur.
- **Audio (`src/audio`)** — first version, all synthesized with WebAudio (no assets): mixer buses bound to the audio settings; an adaptive score (`MusicDirector`) that reshapes one continuous piece per mood — exploration, safe, mystery, tension, combat, boss, cinematic — with pads, arpeggios, bells, bass, drums and a combat motif, crossfading layers; stingers for Return by Death, the Witch, the glint and the strike, the worm's tremor, witchbeast howls, return points; hit sounds by element; UI chimes (quests, knowledge, items); footsteps by surface; desert wind and stone-hall ambience; and per-character **voice blips** from each character's voice data, driven letter by letter from the dialogue window (Subaru's thoughts stay silent). Runs in every browser test without errors; how it *sounds* still needs a pass on real hardware with speakers.

### Phase 9 (part 1) — Menus, title and screens

- **Title screen**: a living night sky over the dunes (twinkling stars, the Pleiades overhead, shooting stars) and the Watchtower's silhouette with the star at its summit glinting now and then. Continue (latest save), New Game, Load, Settings. The simulation is held still behind it. Developer and test URLs (`?area=`) skip it.
- **Pause** (Esc, also mid-fight): where Subaru is, the current objective, the return point, and — from the second loop on — "This is the Nth time." Leads to every other screen; "back" returns to it.
- **Inventory** (I/Tab): items from story state grouped as consumables, key items and documents, with details. Drinking a tonic; ringing the **Carriage Bell** — a loud noise the Sand Earthworm (and anything else under the sand) can hear, the lure for the Glass Flats. The **Faded Journal Page** from the half-buried pack is now a real document: another traveller's warning not to run on the glass.
- **Map** (M): the tower's foot rasterised from the same functions that shape the terrain (dunes shaded by slope, the glass, the plaza and road), the tower and gate, the ruins with their cover radii, the camp, labels, Subaru's arrow, companions, and diamonds for the tracked quest's objectives. Celaeno has a plan of its hall; places without a map say so.
- **Settings**: Graphics (preset, resolution scale, anti-aliasing, field of view, shadows, textures, effects, view distance, post-processing, ambient occlusion, bloom, light shafts, performance overlay), Audio (six volumes), Gameplay (text speed, auto-advance and its pause, chatter subtitles, difficulty, camera sensitivity/invert/shake, toggle sprint, button hints), **Controls** (every rebindable action; select and press the new key or mouse button; reset). Everything applies live and persists separately from saves.
- **Save / Load**: the four slots with area, quest, loop, playtime and date; overwriting and loading ask again; saving is refused mid-fight or mid-scene.
- `MenuList`: one navigable list for keyboard, gamepad and mouse (headers, disabled rows, options, sliders, toggles, value rows); `ScreenManager` with a back-stack, pausing, and a short input settle when screens change so one key press is one action.
- Fixes: pause/unpause restores the previous time scale (the title and the Witch's frozen moment are no longer undone by a menu); a redundant story trigger that could race the new-game flow and request the opening twice is gone (a duplicate cinematic request is now a warning).

### Phase 8 — Inside the tower: Shaula, Alcyone, Taygeta

**Celaeno — the Star Guardian (`src/data/dialogues/celaeno.ts`, `cel.shaula` cinematic)**
- Entering Celaeno for the first time: the party gathers inside the colonnade, a voice shouts "Maaaaster!!" from above, Shaula waves from the gallery balustrade, drops onto the star-map dais and mistakes Subaru for her Master. She lays down the tower's rules (learned as knowledge); an Insight option ("That light on the glass was you") opens if Subaru died to the Heliosphere; the scene starts **The Trial of Taygeta** and sets a Celaeno return point. Afterwards she waits by the dais and can be talked to.
- **The first rule has teeth**: walking out of the great gate before the trial is cleared, Shaula is suddenly there asking where Master is going. Insisting is a Return by Death ("She keeps her word"); in the next loop the fatal answer is gone and the wake-up thoughts reflect it. After the trial, the gate opens normally.
- Every doorway in the round floors now has a stairwell recess behind it (steps up into light, down into the dark, or the night outside the gate) with a blocker at its mouth, so neither characters nor the camera can walk into the void (`doorRecess` in `RoundHall`).
- Cinematic additions: `spawn` / `despawn` steps (optionally `lying`), `anim: 'none'` releases a held pose, and placing someone on a marker without a facing uses the marker's own yaw.

**Alcyone — the keepers' quarters (`src/areas/alcyone`)**
- The first warm place in the tower: a round hall under a beamed wooden ceiling with a lantern ring over a twelve-chair table and woven rugs (canvas-generated patterns), opening onto six rooms — the entry by the stair, a stone hearth with a real fire and a pantry, the **Green Room** (walled off), the way up to Taygeta and a **balcony** over the moonlit dunes, the bedrooms (a bed to rest = save), and a small study with shelves, desk and a lectern. Lore: four hundred years of tally marks in the bedroom wall, a keeper's note on the lectern ("the tower asks only what a true visitor could know").
- **Foliage** (`src/scene/procedural/Foliage.ts`): instanced ferns, bushes, hanging vines, ivy, grass tufts and flowers (three shapes, a handful of draw calls) with a breathing sway in the vertex shader and softly glowing blossoms. The Green Room is overgrown with it: planters along both walls, ivy over the stone, vines from the ceiling, a young tree by the windows, glowing orbs and drifting pollen.
- **Rem is laid down in the Green Room** (zone-triggered `alc.rem` scene): Echidna explains that whoever sleeps there needs no food or water; Ram doesn't know the girl, yet looking at her feels like reaching for something that should be there; Julius — whom the whole world forgot — says she is fortunate to be remembered so fiercely. Everyone leaves; Subaru sits at her bedside and makes his promise. **The return point moves to her side.** Afterwards "Sit with Rem" plays a short vigil whose words change with how things are going (another death, the trial cleared).
- Actors can lie down (`ActorController.setLying`: reclined on the back, foot IK and gaze off), Rem under a quilt; a seated vigil pose (`sitVigil`).
- **The balcony** (after Rem is settled): Emilia finds Subaru under the stars. He recognises **Orion** (now hand-placed in the procedural night sky, `ORION_STARS`), tells her the myth of the hunter killed by the scorpion, points out Rigel — and realises the scorpion's stinger star is called **Shaula**.

**Taygeta — the first trial (`src/areas/taygeta`, `src/data/constellations.ts`)**
- A white room with nothing in it but a black monolith: "Touch upon the greatest splendour of the hero destroyed by Shaula." Reading it dissolves the walls into the night sky over a mirror floor, and six constellations come down within reach on their own "pages" around the room — Orion (lying on its side, as it rises), Scorpius on the far side of the sky, the Big Dipper, Cassiopeia, and two constellations of this world that mean nothing to Subaru.
- **Aim by looking**: the star nearest the centre of the view within arm's reach is highlighted and a single "Touch" prompt follows it (belt stars sit a hand's width apart, so the default focus picker couldn't choose between them).
- **Wrong stars burn** (30 damage, knockback, a white flash). The hints sharpen: Emilia worries, Beatrice scolds, Echidna asks whether "Shaula" might be a word from somewhere else, and on the third burn Subaru remembers on his own. A fourth guess kills him — Return by Death to Rem's side, remembering. Knowing the stinger's name (from the balcony or a previous loop) turns the monolith scene into an immediate insight.
- **Rigel** ends the trial: a white flash, and the room becomes the **library** — three tiers of shelves all the way round, radial stacks rising out of the floor, warm reading lights, book spines from a generated texture merged into one mesh, and a black book on the lectern where the monolith stood. The quest completes ("Only someone from my world could have known").
- Environmental harm can name its cause (`cause:<id>` damage tag), so each kind of death teaches its own lesson.

### Phase 9 (part 2) — Button prompts, stealth feedback, audio pass

**Button prompts that match the device (`src/ui/Glyphs.ts`)**
- Keyboard keycaps, **Xbox** buttons (coloured A/B/X/Y, LB/RB pills, LT/RT, D-pad) or **PlayStation** symbols (✕ ○ □ △, L1/R2...). The pad family comes from the connected gamepad's id (Sony vendor 054c, DualShock/DualSense); anything else wears Xbox symbols.
- `ui.key(...actions)` makes glyph elements that redraw themselves whenever the device in hand changes, the style setting changes or a binding is rebound. The interaction prompt shows the pad's own coloured button inside its diamond. Journal, settings, inventory, map, saves, dialogue controls, the log and the combat HUD all use them.
- New setting **Gameplay → Button prompts**: Auto (follows whatever you last touched) / Keyboard / Xbox / PlayStation.

**Being watched on the Glass Flats (`Heliosphere`)** — all gated on what Subaru knows, so the first crossing stays a surprise:
- A vignette that tightens as exposure builds and burns white on the glint; his **heartbeat** quickens with it (`audio:heartbeat`); his shoulders rise (posture tension follows exposure even before he knows why).
- An edge pointer to the summit when it's out of view — towards where it projects, or along the bottom edge towards the side to turn to when it's behind him (never under the meter, which already points up).
- Once he has learned that stone hides him, the **nearest ruin is marked** with its distance whenever he's exposed.

**Audio pass (`AudioManager`)**
- A synthesized **room reverb** per floor (the desert almost dry, Celaeno a long stone hall, Alcyone a close wooden room, Taygeta a bright, eerie space) fed from sound effects and voices.
- The score **ducks under dialogue** and comes back after.
- **Footsteps by surface** through a new `Area.surfaceAt(x, z)`: sand, the ringing click of fused glass on the flats, stone on the plaza and in Celaeno, wood in Alcyone (stone on the balcony), muffled in Taygeta's white room, glassy under the stars, wood in the library.
- Ambience for the new floors (a warm room tone with the hearth crackling louder as you near it; a thin, sourceless tone in the white room) and cues for the story's moments: the white room opening into night, touching Rigel, the library rising, a wrong star's burn, Rem laid down.

### Phase 10 — The vertical slice, end to end

**The gate plaza in the story (`src/areas/towerfoot/GatePlaza.ts`)**
- A pack of dune jackals holds the plaza; the gate stays shut until they're beaten ("Not with witchbeasts at our backs"). The pack comes in **two waves**: when the first five are down to their last two, a howl, a bark from Ram, and four more come in off the eastern dunes (`CombatManager.holdOpen()` keeps the fight from being won in the gap while they spawn).
- Crossing the flats sets a **return point at the plaza's edge** (its western corner — off the glass, out of the sleeping pack's sight), so losing the fight doesn't mean crossing the glass again. Dying after the second wave has shown itself teaches *More than we could see*.
- The fight's noise wakes the **Sand Earthworm**: a reveal cinematic as it breaches out of the western dunes, then a party scene. If Subaru has died to the light, an Insight option lets him propose the plan himself; otherwise Meili works it out with him. The return point moves to the plaza.
- The **Carriage Bell** rung out on the glass (from the inventory) draws the worm across the dunes; it surfaces on the flats and the Heliosphere takes it. The gate opens.
- Quest objectives with a hint, wake-up thoughts for a worm death, plaza chatter.

**Pacing and presentation**
- **Location banners** (`src/ui/hud/LocationBanner.ts`): a moment after arriving on a floor its name drifts in at the top of the screen — region, name and the floor's line ("Celaeno — The Fifth Floor — where the tower begins") — unless a scene starts instead; scenes, dialogue and death clear it.
- **Boss music**: an encounter with an elite (the Sand Earthworm) switches the score to its boss state instead of the ordinary combat cue.
- **Carrying Rem up the stair**: a new cinematic `carry` step poses one character holding another in their arms (`carryBride` / `carried` gesture clips: his forearms level under her back and knees; she reclines ~50° across them, thighs level and shins hanging, head back against his right arm). Arriving in Alcyone plays a short scene — Subaru with Rem in his arms, Emilia offering to take a turn ("I’ve got her. ...I’ve always got her."), Ram's silence — before the party looks for the Green Room.
- **The chapter card**: solving Taygeta ends on a title card — *Re:Zero · Pleiades — The Watchtower in the Sand* — and sets `story.chapter_done`.

**Fixes found by playing it through**
- **Sinking through round floors**: Alcyone's and Taygeta's floors were single 20 m-wide, 30 cm-thin cylinders; against such a flat, wide cylinder the character controller got imprecise contacts, and a character teleported onto it could slowly slip through (and, in a long scene, fall out of the world). Round floors are now triangle-mesh discs of small triangles (`Physics.addDisc`). `CharacterMotor.teleport` also moves the collider immediately (the controller's next move was computed from the stale collider position) and starts 2 cm above the target so it snaps down cleanly.
- **Keeping the palette under coloured light**: the character shader now pulls lit colour part-way back to the material's own hue at the same brightness (`CharacterLighting.paletteKeep`, 0.35), so a red-lit hall or a blue moon tints characters without washing out identity colours (Rem's blue hair was going grey under the lanterns).
- Winning a fight returns the score to the area's own music (a tower floor's mood, or the desert's unease while the worm is still out there), not always to the exploration theme.
- **Combat balance**: the party was ending the plaza fight in ~7 s without Subaru doing anything. Companions now deal 55% of their former damage to enemies (`CombatManager.companionDamageScale`) — they support, Subaru directs — and with the second wave the fight runs about half a minute; a Subaru who just stands there gets overwhelmed.
- After a scene, the follow camera settles **behind** Subaru when the last shot looked at him from the front (it used to continue from the shot's angle and face him).
- The chapter card waits for the camera to finish pulling back over the library stacks.
- Only the story's own worm counts for the plaza (a stray one struck down on the flats no longer starts the "worm is dead" conversation).

**The slice as one run (`tools/browser/playthrough.mjs`)** — from the title screen: New Game and the camp opening → the ruins → running onto the glass and dying to the light → Return by Death, knowledge kept → the plaza and the pack → the worm, the plan, the bell → the gate and Shaula (choosing the Insight answer) → Alcyone with Rem in his arms → the Green Room → Taygeta's monolith, the sky and Rigel → the library and the chapter card. Travel between beats is by teleport; every beat plays through the real triggers, zones, interactables, cinematics and dialogue.

### Phase 11 (part 1) — Content: the Books of the Dead

Taygeta's library was a destination; now it's the heart of the tower (`src/areas/taygeta/Library.ts`, `src/data/dialogues/library.ts`).
- **The black book on the lectern** opens a conversation: Beatrice — who kept a library of her own for four hundred years — names the Books of the Dead (one for every soul that has died; open one and you live it) and starts the side quest *The Books of the Dead*. Then Subaru can look for a name:
  - **Rem** — Beatrice runs her fingers along the shelves faster than he can read and finds nothing. There couldn't be a book: this is a library of the dead. *Rem is alive.* (Ram's line changes if Subaru told her in the Green Room that the sleeping girl matters to both of them.)
  - **Hadrian** — an Insight option only if Subaru found the half-buried pack by the ruins, whose journal page ("Hadrian says we cross the glass at first light") now also teaches the name. Julius finds his book on a low shelf by the stair; it glows there, breathing warm light, until read.
- **Reading Hadrian's book** is his last morning, lived: the library dreams away into night (a new `memory` look — the shelves vanish, the floor becomes a dark mirror, the colour grade fades to an old photograph), his thoughts in his own words, the star that blinks, Maren shouting behind him — and the white light. Subaru comes back gasping; Beatrice warns him not to open another lightly.
- **Shaula's rule has teeth**: a crack of the whip (or a spell) between the shelves gets a warning from Beatrice; do it again in the same loop and Shaula's light finds him even here (a new death, *Not in the library*). Subaru's kit now announces actions (`combat:playerAction`) so areas can react to violence.
- Solving Taygeta now sets a **return point in the library** (the trial stays solved when he dies there).
- Sound: a descending shimmer into a memory, the light's crack, a bell when a book is found.

### Phase 11 (part 2) — Content: Electra and the Sword Saint

**Reid Astrea** (a new character, `tools/blender/characters/reid.py` → `reid.glb`; redesigned to his canon look in Phase 12, see below): the first Sword Saint's shade — and a pair of chopsticks (an in-hand prop). A lazy, cocky stance; clips for a chopstick flick, a parry, a guard, eating seated, and shaking out his hand when he loses one.

**Electra** (`src/areas/electra/`) — the second floor has no ceiling: a moonlit disc of pale stone open to the sky, a duelling ring inlaid in the floor, broken columns and fallen drums around the rim, four braziers, wind, the dunes a long way down. Reached by a new stair in Taygeta's library (the far wall stays sealed until the library rises); a stair gate leads back down.

**The trial** (`ReidDuel.ts`; the exact rules are this game's adaptation):
- Reid sits on a drum of stone eating when the party arrives; he names the trial — "take me seriously enough that I have to take you seriously" — and stands up with his chopsticks. A new main quest, *The Trial of Electra*, starts when Taygeta's is done.
- **Nothing touches him.** A new `Health.guard` hook turns aside every blow, spell and projectile (a spark and a wooden *clack*; `combat:parried`). The party can fight him all day.
- He gives his **attention** to one opponent at a time — whoever came at him last, otherwise Julius, the other swordsman — faces them, keeps a lazy sword's distance, and every second or so **flicks** away anyone in front of him (a telegraphed cone; light for companions, heavy for Subaru).
- A snare from the front is parried, and draws his eye to Subaru for a moment ("Oi, kid. That tickles."). Standing in front of him is death by chopstick — and the lesson *He watches one of us at a time*.
- **The way through**: Subaru's whip snare, from **behind** while Reid is busy with someone else — or while **Shamak** has him in the dark — wraps his wrist and he drops a chopstick. He laughs; the trial is passed; he sits back down to his noodles (and has something rude to say if you talk to him).
- Party chatter on the windy floor, and Julius's verdict afterwards ("I should like to see the day he isn't bored." — "Please don't. I like having ribs.").
- Return point on arrival; a rematch is a conversation with him ("You've got the eyes of somebody who's already lost to me once"), with Subaru's own plan as a thought once he knows it.

### Phase 12 (part 2) — Character and creature art pass; motion; frame rate

**Tailoring** (`tools/blender/characters/tailor.py`): garments are real layers, not colour zones painted on the body. A *shell* is cut from the skinned body itself (bisected along planes, trimmed by a predicate, lifted off the skin, hem-flared, fold ridges at elbows/knees/cuffs/waist, a turned-under hem lip) and so carries the body's skin weights. Plus modelled shoes and boots, surface-following trims (zips, piping, stripes, laces), buttons and eyelets, plates (buckles, pockets), raised glyphs, a hood worn down, scarves with spring-chain tails, ribbon bows, ruffled lace rings, tattered hems and zori. Skin hidden under opaque clothing is culled. A muscle sculpt (pecs with a hard shelf, abdominals over the linea alba, obliques, collarbones, deltoids, biceps/triceps, shoulder blades, quads, calves) bakes its grooves into vertex colours that the toon material multiplies in.

**Subaru** (`subaru.py`): Arc 6 travelling clothes by default — grey hooded cloak (the hood swings with it), green jacket open over a beige button-up shirt, belt and brass buckle, orange scarf, loose trousers, laced brown boots — and the tracksuit as a costume (white panel and zip, charcoal yoke and sleeves, orange piping, cuffs and stripes, open collar over a black tee, the "N", drawstring hem, black-and-orange trainers). Amber-brown sanpaku eyes with hard, sharp lids and straight brows; a pointed fringe and spiky back. *Settings › Gameplay › Subaru's outfit* swaps the model live (deferred out of scenes and fights; the whip follows the new rig).

**Reid** (`reid.py`): redesigned to his canon look — a long, wild crimson mane on five spring chains with an ahoge, a round black eyepatch with a white spiral painted into the face, a sharp-toothed grin (new `cocky` expression / `fangGrin` mouth), a bare muscled torso, a red kimono robe slipped off the left shoulder (right sleeve on, dark collar band, white crest, the left half bunched over the black sash with its empty sleeve hanging, torn hem), white fundoshi, bare legs, red zori.

**The party** (`party.py`, a detail pass over the roster specs): Emilia (belled sleeves with purple cuffs, a ribbon bow and gold brooch, side braids tied with ribbons, the lily ornament, longer ears, heeled boots), Beatrice (a tiered frilled petticoat in her open overskirt, bell sleeves ending in lace, the big chest bow, her crown, Mary Janes), Julius (epaulettes with fringe, double row of gold buttons, aiguillette, gold cuffs, tall boots; the sword now hangs hilt-forward from the left hip), Ram and Rem (puffed shoulders over detached white sleeves with frills and bands, a black bow, strapped shoes), Meili, Anastasia (sleeves, lavender sash tied at the back) and Shaula (a clean tailored top and shorts, belt, boots).

**Faces** (`FaceRenderer.ts`): lids are sampled curves (round or sharp), lashes a tapered band with an outer flick, irises get a dark top, radial streaks and a lid shadow; clenched-teeth and fanged-grin mouths; an eyepatch option. Characters no longer receive screen-space AO (it read as grime on cel shading).

**Creatures** (`tools/blender/creatures/`): vertex-colour albedo painting, tack weighted like the body surface under it, and a detail kit (feather/fur blades and fans, curved claws, teeth, straps and girths, rings, studs, shells cut from the body). **Patrasche** (`patrasche.py`): a raptor-like land dragon — long S-neck and horse-long head, keeled chest, drumstick thighs, sickle claws, small clawed hands; black scales banded down the back with a pale throat and belly; gold slit eyes; dark feather plumes (crest, cheeks, neck mane, tail fan); a leather visor ending in a beak, a bridle with gold bit rings and reins, a saddle with pommel and cantle on a red pad, flaps, stirrups, girth and breast collar with gold buckles, tail wraps. **Dune jackals** (`jackal.py`): a rangy witchbeast canid — deep chest and tucked waist, angular legs, long fanged muzzle, tall ragged ears, the swept horn, burning eyes; sandy coat with a dark saddle, pale belly and dark socks; a ragged black mane, ruffs and a bushy dark-tipped tail.

**Sprint glitches fixed**: spring bones simulate partly in the character's own frame (a VRM-style spring center, 35% inertia) and step every frame in equal sub-steps with time-corrected verlet and a travel clamp, instead of a fixed 60 Hz accumulator in pure world space — the hair and cloth no longer judder at high refresh rates or slam into the colliders at a sprint. Follower steering is low-pass filtered, actors ease into a heading instead of bang-bang turning, and the run lean is smoothed and capped. `tools/browser/jitter.mjs` measures it: spring-bone jerk ~6× lower, body twitch about halved, heading jitter at p95 up to 10× lower.

**Frame rate**: characters and creatures are consolidated at export (garment colours baked into vertex colours, everything merged per shading role) — 4–5 meshes per character instead of ~35, which also cuts outline, shadow and AO-mask draws; dynamic resolution (on below Ultra) steps the render scale down under ~50 fps and back up when it recovers; high-DPI screens render at most 1.5× CSS pixels (2× on Ultra); face textures repaint at 30/15/6 Hz by distance.

**Interactions and light**: party chatter lines carry a gesture (explicit or chosen from the expression) and listeners sometimes nod along; the cel ramp has a warm band along skin's light/shadow terminator.

### Phase 12 (part 3) — Playtest fixes: fights, the gate, directing, canon, outfits

**Black flashes in fights**: the campfire's point-light cube shadow (High/Ultra) made every lit material render black in the camp fight whenever its frozen cube map was sampled. Fires no longer cast cube shadows (also six fewer scene renders a frame). The tower foot gets a night fill so shadows read blue. Characters and creatures dissolve faster as the camera closes on them, and the worm fades by its nearest segment so a breach can't fill the screen with hull. `tools/browser/blackframes.mjs` hunts dark frames in a fight.

**Frame rate**: index-only LODs for every character and creature (`MeshLod.ts`: meshoptimizer's attribute-aware simplifier, sharing the source vertex buffers so skinning and springs are untouched; levels by on-screen size, outline shells a level coarser) — the camp fight went from 2.44 M to 1.35 M triangles a frame. Face repaints are capped at three a frame across the cast. **Ultra** no longer renders at 1.25× on top of the 2× high-DPI cap (that was the lag): it renders at native scale with dynamic resolution, and saved presets pick up retuned values. `fightperf.mjs` times every system in a fight; `tribudget.mjs` breaks a scene's triangles down by owner.

**The tower gate**: the approach stairs were thin floating treads over a 4.8 m solid block you walked through on an invisible ramp that stopped 0.54 m under the landing. Now: solid treads meeting the landing edge, parapet cheeks with coping and newels, a ramp collider through the tread midpoints, the landing cut back where it z-fought the plinth ring, a collider for the plinth's top, lit wooden doors (with a collider) and a brazier either side. `collider_cyl` turns about its own centre (the fallen giant's collision sat half underground), rubble and the campfire collide, the outer rocks and flats debris collide, window arch caps no longer z-fight. `tools/browser/meshaudit.mjs` audits an area for coplanar overlapping faces (z-fighting) and for surfaces at body height with no collider behind them.

**Combat feel**: a snappier whip (the crack lands ~0.23 s after the press) chained the moment it lands; a 0.4 s input buffer; dodge-cancel during the windup and snare/dodge cancels after the crack; a short lunge closes the gap to the target. **Perfect dodge**: a blow that passes through a fresh dodge slows time and sets up a critical (and a bug fixed: blows soaked by E·M·M never reached the barrier, so its counter could never trigger). Enemies are knocked back along the blow and flash white-hot; the last blow of a fight gets a beat of slow motion. The camera kicks and punches its FOV on impacts, keeps both fighters framed on lock-on, and swings gently toward whatever Subaru strikes.

**Directed conversations**: shot drift eases out (bounded) instead of carrying the camera off its subjects on a long line; shots track the speaker's head with a smoothed, limited pan (people turn to face each other, gesture, shift); a wall behind the camera makes it orbit for a clear angle and widen the lens to hold the framing instead of shoving into a face (never closer than 0.9 m, falling back to other coverage); singles are medium close-ups (head about a quarter of the frame), not face-filling close-ups; a run of lines from one speaker cycles single → hold → two-shot (the listener's reaction) → hold. `tools/browser/shots.mjs` measures every shot of the camp conversations (head position and size in frame, distance, occlusion).

**Canon — Taygeta**: Beatrice remarks that Shaula's braid curls into a hook "like something that stings", and Subaru reasons it out in his mind's eye (`StarVision`: his world's sky inked over the scene, beat by beat): his name is the Pleiades, so he knows the sky around it; Scorpius, Antares, the tail curling to the stinger — Shaula; Orion, the hunter the scorpion killed, hung on the far side of the sky, setting as the scorpion rises; not Betelgeuse (the alpha, a fading red giant — "one Betelgeuse in my life was plenty"); Rigel, blue-white at his foot. Then he touches the stone, the room becomes the sky, and he has to find the hunter's foot — wrong stars still burn, Betelgeuse with its own line. In a later loop he simply recalls the answer.

**Canon — Electra**: the trial is "make me take one step off this spot". Reid stays rooted (turning on the spot) and parries everything; Subaru's best trick only drops a chopstick — "that's a chopstick, kid; look at my feet". Emilia freezes the floor under his sandals and he steps: she alone passes. A stair of light winds down out of the sky (`LightStair`, 54 steps in a helix from 62 m up, bells and a light riding down it); Reid names what's up there (Volcanica); the party decides Emilia doesn't climb alone — not yet. The stair stays, and only she could climb it.

**Canon — the memory loss**: wanting a way past Reid, Subaru looks for his Book of the Dead (Ram finds it, shelved out of reach). Reading it, the pages turn on their own and something of Gluttony's is reading with him — "Itadakimasu." He wakes on the library floor remembering nothing since the convenience store. Julius realises no one left remembers his name; Ram, who doesn't remember Rem either, tells him about the sleeping girl he wouldn't stop talking about. The return point moves to the library floor, every companion's talk changes, and the slice ends on "Natsuki Subaru, Who Remembers No One".

**Outfits from reference**: Emilia (Arc 6, default) — the white cloak with its cat-eared hood up (purple tips), a frilled capelet, puffy white sleeves with pink cuffs, the purple bodysuit, white boots, her hair in one long braid on its own spring chain; her classic outfit (wide white sleeves lined purple with a gold emblem, the green gem, thigh-high boots, a braided crown) as an alternate. Ram (Arc 6, default) — a mint hooded capelet lined lavender with a scalloped hem, white blouse with lace cuffs, a brown corset with gold buckles, a mint skirt laced up the front over a frilled petticoat, brown tights, mint lace-up boots with bows, flowers on her headdress and the X clip with its purple ribbon; the maid uniform as an alternate. Shaula — reddish-brown hair in a braided high ponytail that arcs over her head and curls up at the end like a scorpion's stinger, tipped with a gold star bead; a black-and-orange bow; the top tied at the front; a star-bead necklace; the cape lined in orange; stars on her boot cuffs. *Settings › Gameplay › Party outfits* (Arc 6 / Classic) applies from the next area. Accessories can now ride a hair spring chain (braids), weighted by arc length along it.

## Testing
- `npm run typecheck` — strict TypeScript.
- `npm test` — Vitest unit tests (event bus, flag scoping/rewind, snapshot validation, scheduler, FSM, math, conditions, breadcrumb trail, character/chatter data validation), combat damage model and Health, pack attack tokens and fairness, telegraph areas and expiry, enemy data, dialogue runner (lines, conditions, effects, hidden/locked/once/insight choices, branching), quest evaluation, validation of every dialogue, quest, cinematic, story trigger and talk entry, the Return-by-Death rewind semantics, death/return-point data, save validation (corrupt/tampered/future saves rejected), the flats cover, Taygeta's constellations (the answer exists and is Orion's brightest star, lines are valid, every figure within reach and clear of the stair, the sky's Orion matches the trial's), and the button glyph mapping and pad detection. **72/72 passing.**
- `npm run smoke` — Playwright drives the real game in Chromium and asserts on state:
  - `tools/browser/smoke.mjs` (dev gym): **13/13** — walk, sprint/stamina, stairs, jump/land, slope limit, corridor camera, focus + read, hold lever → gate, door → walk through.
  - `tools/browser/areas.mjs`: **7/7** — tower_foot loads grounded, dune walking, gate prompt, gate → Celaeno, Celaeno gate → back outside, no VFX leaks across unloads (emitter count back to its first-load value). 0 console errors.
  - `tools/browser/party.mjs`: **16/16** — four companions (incl. Patrasche) spawn near Subaru, keep up while sprinting, settle and give him room, climb stairs, follow him down a ledge, are placed with him on teleport; an interaction triggers Beatrice → Subaru chatter that finishes, is remembered and does not repeat; leaving despawns cleanly.
  - `tools/browser/combat.mjs`: **15/15** — entering the ring starts the encounter, lock-on, the whip combo damages dummies, the dive dodge moves Subaru with i-frames, Shamak blinds, E·M·M nullifies a hit and sets up a critical counter, a blow inside a fresh dodge is a perfect dodge (slow motion), a press mid-swing is buffered into the next combo hit, a tonic heals, every companion lands hits with their own kit, brains swap to combat and back, leaving the ring ends the fight.
  - `tools/browser/enemies.mjs`: **10/10** — jackals start unaware, the pack notices Subaru and alerts together, attacks are telegraphed on the ground, never more than two attack at once, Shamak blinds them, they press their attacks, the party wins and the encounter ends, the fallen are cleaned up, 0 console errors.
  - `tools/browser/earthworm.mjs`: **8/8** — invulnerable underground, standing still hides Subaru, running draws it in and it telegraphs an eruption, surfacing starts an elite encounter with the boss bar, it can be hurt (resistant) while surfaced, the Heliosphere kills it, it sinks away and the encounter ends, 0 console errors.
  - `tools/browser/dialogue.mjs`: **25/25** — a conversation takes over (mode, window, camera), letter-by-letter reveal, advance completes then continues, the log, auto mode to the choice, hidden/locked options, a choice's effect, skip to the end with control and camera returned, a quest starting itself and showing on the tracker, objectives from zones and a won fight, the completion banner, an Insight option unlocked by knowledge and picked with the mouse, thought styling, the journal (quests, Subaru Remembers, pause/resume), a new game's camp opening (letterbox, party staged), reading through the conversation choosing the Insight option, quest/knowledge/control after the scene, talking to Emilia and her follow-up line, hold-to-skip reaching the same end state, 0 console errors.
  - `tools/browser/rbd.mjs`: **16/16** — the story starts with a return point and an autosave; no HUD before Subaru knows the rules; running on the open glass draws the glint and the light kills him; Return by Death to the camp in loop 2; the world rewound (ruins visited and objectives undone) while knowledge and the loop count survive; the party back whole; trying to tell brings the Witch and time resumes after; in loop 2 the detection meter appears, the glint warning shows, hiding behind the ruins makes the strike miss and teaches cover; the worm breaching on the glass is struck down; save/load restores flags, knowledge, return point and position; being watched is felt (vignette, pulse, posture) and the summit is pointed out; knowing cover, the nearest ruin is marked; glass footsteps, heartbeats and the desert's dry room in the audio; 0 console errors.
  - `tools/browser/menus.mjs`: **14/14** — the game opens on the title (time held, Continue disabled without saves); Settings from the title changes a volume live and returns; New Game hides the title and starts the story; Esc pauses with location/objective/return point; the inventory lists tonics and the Carriage Bell; ringing the bell closes the menus and makes the noise; the map opens drawn; saving to a slot from the pause menu; back returns to pause; rebinding Interact to G; button prompts switching live between keycaps, Xbox and PlayStation (and the style setting overriding the device); Esc closes everything and play resumes; 0 console errors.
  - `tools/browser/tower.mjs`: **22/22** — Shaula's arrival (rules, quest, Celaeno return point); leaving through the gate is a Return by Death, and in the next loop the fatal answer is gone; the gallery stair to Alcyone, arriving with Rem in Subaru's arms (wooden footsteps, a close room, music ducking under dialogue); the Green Room scene (Rem lying in bed, return point at her side); up to Taygeta; reading the monolith, Subaru reasons it out (Shaula → Orion → Rigel) and the room turns to night; aiming at Betelgeuse by looking and touching it burns (with its own line); two more wrong stars sharpen the hints; the fourth kills him and he wakes beside Rem knowing; the next climb recalls the answer and goes straight to the sky; Rigel raises the library and completes the quest; the gate then opens; the balcony scene with Emilia; 0 console errors.
  - `tools/browser/plaza.mjs`: **10/10** — the pack waits on the plaza and the gate won't open; walking on starts the fight and moves the return point off the flats; the second wave arrives as the first falls and the fight holds until it does; beating it starts the worm's reveal and the plan (with the Insight option); the return point moves to the plaza; dying to the worm returns Subaru to the plaza with the pack still dead; the bell on the glass draws the worm into the light; the gate opens; 0 console errors.
  - `tools/browser/library.mjs`: **7/7** — the lectern names the Books of the Dead and starts the quest; there is no book for Rem (the quest completes); Hadrian's name finds his book; reading it dreams the library away into his memory and back; a whip crack draws Beatrice's warning, a second one Shaula's light, and he wakes in the library knowing the rule — and still knowing Rem is alive; 0 console errors.
  - `tools/browser/electra.mjs`: **11/11** — the library's stair up opens onto Electra and Reid; meeting him starts the duel (boss music, return point); every party blow is parried and he never leaves his spot; a snare from the front is turned aside and draws his eye; standing in front of him is death by chopstick, and Subaru wakes in Electra knowing the lesson; talking to him starts a rematch; from behind, while he duels Julius, the snare drops a chopstick — not a step; Emilia makes him step and alone passes, the stair of light comes down, and the party agrees she waits; at the lectern Ram finds Reid's book; reading it, Gluttony eats Subaru's memories (amnesia, the return point on the library floor, every companion's talk changed); 0 console errors.
  - `tools/browser/playthrough.mjs`: **9/9** — the whole slice as above, beat by beat, 0 console errors.
- Every browser test takes `GAME_URL` (default: the dev server on 5173). Editing sources hot-reloads the dev server's page under a running test, so long runs are best pointed at a production build: `npx vite build --minify false --outDir /tmp/rz-build && npx vite preview --outDir /tmp/rz-build --port 4173` (unminified: some tests find components by class name), then `GAME_URL=http://127.0.0.1:4173/ npm run smoke`.
- Rebuilding character models: Blender isn't installed in a fresh container — `python3.11 -m venv /tmp/bpyenv && /tmp/bpyenv/bin/pip install -r tools/blender/requirements.txt`, then `BLENDER_PYTHON=/tmp/bpyenv/bin/python node tools/blender/run-blender.mjs characters <id>`.
- `node tools/browser/screenshots.mjs` — stages a frame in each part of the game (the camp, Shaula, the carry, the star trial, the chapter card, Reid) and writes the README's JPEGs to `docs/screenshots/`.
- `node tools/browser/sheet.mjs <prefix> <out.png> [cols]` — contact sheet of test screenshots for review.
- `npm run cast` — lineup review: every character spawned side by side plus face close-ups (`test-results/cast_*.png`).
- `node tools/browser/modelsheet.mjs <id|player> [--costume=tracksuit] [--outfits=classic] [--torso=1]` — one character or creature turned round (front, ¾, side, back, face/head close-up) in a single sheet.
- `node tools/browser/faces.mjs [id ...]` — every painted face in several expressions (no 3D; needs the dev server).
- `node tools/browser/jitter.mjs` — party motion smoothness while following a sprinting Subaru at uneven frame times.
- `node tools/browser/fightperf.mjs`, `tribudget.mjs`, `blackframes.mjs` — fight profiling, triangle budget by owner, dark-frame hunt.
- `node tools/browser/meshaudit.mjs [area ...]` — z-fighting and walk-through audit; `node tools/browser/shots.mjs` — conversation shot measurements.
  - Celaeno's helical stair verified climbable from floor to the 12 m gallery.
  - The container has no GPU, so the harness steps the simulation at a fixed 60 Hz and renders only for screenshots (`game.advanceAsync`). Screenshots go to `test-results/`.

## Systems in progress
- The carry into Alcyone is a staged pose, not a walk: Subaru doesn't climb the stair with Rem in his arms in gameplay.

## Known issues
- Kit-to-terrain placement uses the analytic height function; very large pieces on steep dune faces can float slightly at one corner.
- The tower's buttresses use simple box colliders; the upper tiers have no collision (unreachable).
- Characters are modelled in an A-pose; garments that cover the shoulders (capes, capelets, Subaru's cloak, Ram/Rem's puffed sleeves) can clip the upper arm when the arms swing far out.
- Garment shells share the body's weights, so they deform with it; at extreme bends (deep crouches, arms raised overhead) the body can show through a seam.
- Canon details were matched from reference images where available (Subaru, Reid, Patrasche, Emilia, Ram, Shaula); the others follow the series' common look and may differ from a specific arc's outfit in small ways.
- Changing *Party outfits* takes effect when the next area loads (spawned companions keep their model until then).
- Emilia's hood is rigid to her head; the long braid hangs outside the cloak and can brush through it when she turns sharply.
- Party slots are path-based; in very cluttered rooms a companion may briefly take the breadcrumb route before a direct line opens. Warps only happen out of view.
- `PlaceholderVisual` remains as the fallback if a character model fails to load.
- Enemy steering is direct (no navmesh); jackals rely on open sand and circling slots. Interiors will need a navigation grid if beasts ever come inside.
- Julius's in-hand sword is a procedural prop and the sheathed sword mesh (hilt + scabbard) is hidden while it's drawn.
- Real-time frame rate cannot be measured in this container (software rendering). Performance numbers must be taken on real hardware.
- The browser harness renders only the last frame of each step, so colour-grade blends and eye adaptation barely advance between screenshots; tests call `applyAtmosphere(area, 0)` before screenshots that follow a look change. In real play they blend normally.
- Party members walking out of the Green Room use direct steering and can snag on furniture; the scene places them outside behind a fade.
- Rem's apron can press into the quilt from below at some angles.

## Next tasks
1. Phase 12 — optimization, bug fixing, final presentation; a full playthrough by hand on real hardware (pacing, walk times, chatter density).
2. On real hardware: an audio mix pass with speakers (levels, reverb amounts, the heartbeat), and frame-rate measurements per area and preset.

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
- **Telegraphs are data the AI reads** — the same warning the player sees is what companions query to dodge and what the attack resolves against, so what you see is what hits.
- **Story state is flags, all the way down** — quests, dialogue memory, visited places and story beats all live in world flags, so saving is a snapshot and Return by Death rewinds everything except `know.*`.
- **Death is a restore, not a reload of a save** — Return by Death restores world flags from the return point and rebuilds the area; knowledge and loop bookkeeping are separate scopes, so the rule "Subaru keeps only what he knows" is enforced by the data model, not by special cases.
- **Readable cover over literal line of sight** — the summit is ~75° up from the flats, so true ray cover would be a sliver behind each wall; cover radii around the ruins match what a player reads as "behind the stone".
- **Skipping resolves, it doesn't jump** — a skipped cinematic runs every remaining step instantly, so the world ends up identical whether the scene was watched or not.
- **Attack tokens over per-enemy aggression** — a pack director hands out attack slots, which keeps fights readable and lets difficulty scale by token count rather than by damage.
- **Puzzles that only Earth knowledge solves, and deaths that teach it** — Taygeta's answer can be learned three ways (the balcony conversation, the escalating hints, or dying and remembering), all through the same knowledge flags, so the riddle is fair without ever being explained by the world.
- **Aim by looking for fine choices** — when targets sit centimetres apart, the camera ray picks, and one interactable follows the aim, instead of fighting the proximity-based focus picker.

## Performance concerns
- tower_foot renders ~360k triangles and ~245 draw calls at High (terrain inner mesh ~100k tris, tower ~38k). Candidates if needed: terrain LOD rings, merging static kit cells into BatchedMesh, lower-res horizon skirt.
- No point light casts shadows (cube shadows were six extra scene renders a frame, and broke the camp fight's lighting).
- N8AO and SMAA are the most expensive passes; both scale with quality presets (AO half-res, disabled on Low).
- Shadow-casting local lights must stay within the per-tier budget (`SHADOW_LIGHT_BUDGET`).
- Trimesh colliders for large kit pieces should use simplified collision proxies (Phase 2 exports them).
- The two-wave plaza fight (nine jackals, the whole party) was the heaviest frame measured: 4,412 draw calls / 3.06 M triangles across all passes. Merging creature parts by material (a jackal 81 → 11 meshes) and clipping the campfire's cube shadow to its light radius (it was redrawing everything within 500 m, six times) brought it to 450 / 1.19 M. Humanoid characters (13–20 meshes each) could be merged the same way.
- Characters: ~33–56k triangles each (the tailored garments added detail) plus an outline shell (≈2× vertex work), but only 4–5 meshes each after export consolidation. A full party on screen is ~400k triangles; candidates if needed: outline shells dropped beyond ~25 m, LOD meshes from Blender's decimate.
- Spring bones run on the CPU every frame in ≤1/60 s sub-steps (≈80 joints for Emilia); fine for a party, would need culling/LOD for crowds.
- Alcyone: ~600k triangles and ~250 draw calls with the whole party in view (the Green Room foliage is ~6k instanced leaves). Candidates: foliage distance culling per room, fewer ivy leaves on Low.
- Taygeta's library: three tiers of shelves around the wall (≈170 kit instances) and a single merged mesh of book spines; ~200k triangles.
