# Re:Zero - Pleiades — Development Status

_Last updated: end of Phase 7._

## Current phase

**Phase 7 complete → Phases 8–9 in progress** (menus and screens, audio, puzzles and tower interiors).

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

## Testing
- `npm run typecheck` — strict TypeScript.
- `npm test` — Vitest unit tests (event bus, flag scoping/rewind, snapshot validation, scheduler, FSM, math, conditions, breadcrumb trail, character/chatter data validation), combat damage model and Health, pack attack tokens and fairness, telegraph areas and expiry, enemy data, dialogue runner (lines, conditions, effects, hidden/locked/once/insight choices, branching), quest evaluation, validation of every dialogue, quest, cinematic, story trigger and talk entry, the Return-by-Death rewind semantics, death/return-point data, save validation (corrupt/tampered/future saves rejected) and the flats cover. **61/61 passing.**
- `npm run smoke` — Playwright drives the real game in Chromium and asserts on state:
  - `tools/browser/smoke.mjs` (dev gym): **13/13** — walk, sprint/stamina, stairs, jump/land, slope limit, corridor camera, focus + read, hold lever → gate, door → walk through.
  - `tools/browser/areas.mjs`: **7/7** — tower_foot loads grounded, dune walking, gate prompt, gate → Celaeno, Celaeno gate → back outside, no VFX leaks across unloads (emitter count back to its first-load value). 0 console errors.
  - `tools/browser/party.mjs`: **16/16** — four companions (incl. Patrasche) spawn near Subaru, keep up while sprinting, settle and give him room, climb stairs, follow him down a ledge, are placed with him on teleport; an interaction triggers Beatrice → Subaru chatter that finishes, is remembered and does not repeat; leaving despawns cleanly.
  - `tools/browser/combat.mjs`: **12/12** — entering the ring starts the encounter, lock-on, the whip combo damages dummies, the dive dodge moves Subaru with i-frames, Shamak blinds, E·M·M nullifies a hit, a tonic heals, every companion lands hits with their own kit, brains swap to combat and back, leaving the ring ends the fight.
  - `tools/browser/enemies.mjs`: **10/10** — jackals start unaware, the pack notices Subaru and alerts together, attacks are telegraphed on the ground, never more than two attack at once, Shamak blinds them, they press their attacks, the party wins and the encounter ends, the fallen are cleaned up, 0 console errors.
  - `tools/browser/earthworm.mjs`: **8/8** — invulnerable underground, standing still hides Subaru, running draws it in and it telegraphs an eruption, surfacing starts an elite encounter with the boss bar, it can be hurt (resistant) while surfaced, the Heliosphere kills it, it sinks away and the encounter ends, 0 console errors.
  - `tools/browser/dialogue.mjs`: **25/25** — a conversation takes over (mode, window, camera), letter-by-letter reveal, advance completes then continues, the log, auto mode to the choice, hidden/locked options, a choice's effect, skip to the end with control and camera returned, a quest starting itself and showing on the tracker, objectives from zones and a won fight, the completion banner, an Insight option unlocked by knowledge and picked with the mouse, thought styling, the journal (quests, Subaru Remembers, pause/resume), a new game's camp opening (letterbox, party staged), reading through the conversation choosing the Insight option, quest/knowledge/control after the scene, talking to Emilia and her follow-up line, hold-to-skip reaching the same end state, 0 console errors.
  - `tools/browser/rbd.mjs`: **13/13** — the story starts with a return point and an autosave; no HUD before Subaru knows the rules; running on the open glass draws the glint and the light kills him; Return by Death to the camp in loop 2; the world rewound (ruins visited and objectives undone) while knowledge and the loop count survive; the party back whole; trying to tell brings the Witch and time resumes after; in loop 2 the detection meter appears, the glint warning shows, hiding behind the ruins makes the strike miss and teaches cover; the worm breaching on the glass is struck down; save/load restores flags, knowledge, return point and position; 0 console errors.
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
- Enemy steering is direct (no navmesh); jackals rely on open sand and circling slots. Interiors will need a navigation grid if beasts ever come inside.
- Julius's in-hand sword is a procedural prop and the sheathed sword mesh (hilt + scabbard) is hidden while it's drawn.
- Real-time frame rate cannot be measured in this container (software rendering). Performance numbers must be taken on real hardware.

## Next tasks
1. Phase 9 (in progress) — menus: pause, inventory (tonics, the Carriage Bell lure, documents), map, settings (graphics/audio/gameplay/controls), save/load screens, title screen; the menu list component and item data are written.
2. Phase 8 — puzzles and interiors: Taygeta star-pillar trial (Orion → Rigel), Alcyone living quarters and the Green Room (carry Rem), the white room → library transition; Shaula's arrival in Celaeno and its return point.
3. Phase 10 — assemble the vertical slice end to end (camp → ruins → flats loop → gate plaza jackals → the worm lured into the light → Celaeno → Alcyone → Taygeta), then polish.

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

## Performance concerns
- tower_foot renders ~360k triangles and ~245 draw calls at High (terrain inner mesh ~100k tris, tower ~38k). Candidates if needed: terrain LOD rings, merging static kit cells into BatchedMesh, lower-res horizon skirt.
- One shadow-casting point light (campfire) at High/Ultra only.
- N8AO and SMAA are the most expensive passes; both scale with quality presets (AO half-res, disabled on Low).
- Shadow-casting local lights must stay within the per-tier budget (`SHADOW_LIGHT_BUDGET`).
- Trimesh colliders for large kit pieces should use simplified collision proxies (Phase 2 exports them).
- Characters: ~30–41k triangles each plus an outline shell (≈2× vertex work). A full party on screen is ~300–400k triangles; candidates: outline shells dropped beyond ~25 m, LOD meshes from Blender's decimate, face texture updates throttled for distant characters (already only redrawn on change).
- Spring bones run on the CPU at 60 Hz sub-steps (≈80 joints for Emilia); fine for a party, would need culling/LOD for crowds.
