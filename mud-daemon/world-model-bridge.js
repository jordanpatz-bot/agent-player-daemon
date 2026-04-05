'use strict';
// world-model-bridge.js — Perception dispatcher.
// Routes game data into the WorldModel via the appropriate adapter:
//   - GMCP events  → bridges/gmcp-bridge.js  (MUD-specific)
//   - Raw text      → bridges/text-bridge.js  (MUD-specific)
//   - File-IPC JSON → inline wireFileIpc()     (perception-agnostic, canonical pattern)
//   - Game state    → inline wireGameState()   (perception-agnostic)
//
// For visual games (future): add bridges/vision-bridge.js, wire here.

const { wireGmcp: gmcpWireGmcp } = require('./bridges/gmcp-bridge');
const { processText: textProcessText } = require('./bridges/text-bridge');

class WorldModelBridge {
  constructor(options = {}) {
    this.worldModel = options.worldModel;
    this.serverProfile = options.serverProfile;
    this.log = options.log || ((type, msg) => console.log(`[Bridge:${type}] ${msg}`));
  }

  // --- GMCP adapter (delegates to gmcp-bridge.js) ---
  wireGmcp(gmcpHandler) {
    gmcpWireGmcp(gmcpHandler, this.worldModel, this.serverProfile, this.log);
  }

  // --- Game state engine (perception-agnostic, stays inline) ---
  wireGameState(gameStateEngine) {
    const wm = this.worldModel;

    gameStateEngine.on('transition', ({ from, to, reason }) => {
      wm.updateSelf({ state: to });
      wm.recordEvent({
        type: 'state_transition',
        detail: `${from} → ${to} (${reason})`,
      });
    });
  }

  // --- File-IPC adapter (perception-agnostic, canonical pattern) ---
  // Structured JSON from visual games like Caves of Qud.
  // The connection emits 'data' with a parsed JSON object each poll cycle.
  wireFileIpc(connection) {
    const wm = this.worldModel;

    connection.on('data', (data) => {
      if (typeof data !== 'object') return;
      const s = data;

      // Core vitals
      wm.updateSelf({
        name: s.name,
        level: s.level || 0,
        hp: s.hp || 0,
        maxHp: s.maxHp || 0,
        xp: s.xp || 0,
      });

      // Position → room
      if (s.position) {
        const locId = `${s.position.x},${s.position.y}`;
        wm.updateSelf({ locationId: locId });
        wm.updateRoom({
          id: locId,
          name: s.zoneName || 'unknown',
          zone: s.zone || 'unknown',
          exits: s.exits || {},
        });
      }

      // Entities in zone
      if (s.entities) {
        wm.clearEntitiesInRoom(wm.self.locationId);
        for (const e of s.entities) {
          wm.addEntity({
            type: e.hostile ? 'hostile' : 'npc',
            name: e.name,
            locationId: `${e.x},${e.y}`,
            hp: e.hp,
            maxHp: e.maxHp,
            hostile: e.hostile,
          });
        }
      }

      // Inventory, equipment, and extended state
      if (s.inventory) wm.updateInventory(s.inventory.map(i => ({ name: i })));
      if (s.adjacent) wm.self._adjacent = s.adjacent;
      if (s.equipment) wm.self._equipment = s.equipment;
      if (s.mutations) wm.self._mutations = s.mutations;
      if (s.skills) wm.self._skills = s.skills;
      if (s.effects) wm.self._effects = s.effects;
      if (s.quests) wm.self._quests = s.quests;
      if (s.messages) wm.self._messages = s.messages;

      wm.emit('self:changed', wm.self);
    });
  }

  // --- Text adapter (delegates to text-bridge.js) ---
  processText(text) {
    textProcessText(text, this.worldModel, this.serverProfile, this.log);
  }
}

module.exports = { WorldModelBridge };
