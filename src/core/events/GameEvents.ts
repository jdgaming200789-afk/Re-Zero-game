import type { Vector3 } from 'three';

/**
 * The global event contract. Every cross-system notification is declared here
 * so it is discoverable in one place and type-checked at every call site.
 *
 * Naming: `domain:happening` in past tense for facts ("quest:started"),
 * present tense for requests ("audio:playCue").
 */
export interface GameEvents {
  // ---- Lifecycle -----------------------------------------------------------
  'game:ready': { firstBoot: boolean };
  'game:paused': { paused: boolean; reason: string };
  'game:modeChanged': { from: GameMode; to: GameMode };

  // ---- Scenes / areas ------------------------------------------------------
  'area:loadStarted': { areaId: string };
  'area:loadProgress': { areaId: string; progress: number };
  'area:loaded': { areaId: string };
  'area:unloaded': { areaId: string };
  'area:entered': { areaId: string; spawnId: string };
  'zone:entered': { zoneId: string; areaId: string };
  'zone:exited': { zoneId: string; areaId: string };

  // ---- Settings ------------------------------------------------------------
  'settings:changed': { key: string };

  // ---- Interaction ---------------------------------------------------------
  'interaction:focusChanged': { interactableId: string | null };
  'interaction:started': { interactableId: string; kind: string };
  'interaction:completed': { interactableId: string; kind: string };

  // ---- Player / characters -------------------------------------------------
  'player:spawned': { characterId: string };
  /** Player teleported/placed (spawns, checkpoints, Return by Death). */
  'player:placed': { position: Vector3; yaw: number };
  'party:joined': { characterId: string };
  'party:left': { characterId: string };
  'player:landed': { fallHeight: number };
  'player:footstep': { position: Vector3; surface: string; intensity: number };
  'character:damaged': { entityId: number; amount: number; sourceId: number | null; stagger: boolean };
  'character:died': { entityId: number; characterId: string };
  'character:revived': { entityId: number; characterId: string };

  // ---- Story / world state -------------------------------------------------
  'flag:changed': { key: string; value: FlagValue; previous: FlagValue | undefined };
  'knowledge:learned': { id: string; title: string };
  'story:event': { id: string };

  // ---- Quests --------------------------------------------------------------
  'quest:started': { questId: string };
  'quest:objectiveUpdated': { questId: string; objectiveId: string };
  'quest:completed': { questId: string };

  // ---- Inventory -----------------------------------------------------------
  'inventory:changed': { itemId: string; delta: number; total: number };
  'inventory:used': { itemId: string };

  // ---- Dialogue / cinematics ----------------------------------------------
  'dialogue:started': { dialogueId: string };
  'dialogue:line': { dialogueId: string; lineId: string; speakerId: string | null };
  'dialogue:ended': { dialogueId: string };
  'cinematic:started': { cinematicId: string };
  'cinematic:ended': { cinematicId: string; skipped: boolean };
  'bark:play': { speakerId: string; text: string; duration: number };

  // ---- Combat --------------------------------------------------------------
  'combat:started': { encounterId: string };
  'combat:ended': { encounterId: string; victory: boolean };
  'combat:hit': { attackerId: number; targetId: number; position: Vector3; amount: number; critical: boolean };
  'combat:lockOnChanged': { targetId: number | null };

  // ---- Return by Death / checkpoints --------------------------------------
  'checkpoint:reached': { checkpointId: string };
  'rbd:deathBegan': { cause: string; loop: number };
  'rbd:returned': { checkpointId: string; loop: number };

  // ---- Audio ---------------------------------------------------------------
  'audio:musicState': { state: MusicState };
  'audio:stinger': { id: string };

  // ---- UI ------------------------------------------------------------------
  'ui:notify': { text: string; kind?: 'info' | 'item' | 'quest' | 'knowledge' | 'warning' };
  'ui:screenOpened': { screen: string };
  'ui:screenClosed': { screen: string };
}

export type FlagValue = boolean | number | string;

export type GameMode =
  | 'boot'
  | 'title'
  | 'exploration'
  | 'combat'
  | 'dialogue'
  | 'cinematic'
  | 'menu'
  | 'loading'
  | 'death';

export type MusicState = 'silence' | 'exploration' | 'tension' | 'combat' | 'boss' | 'cinematic' | 'safe' | 'mystery';
