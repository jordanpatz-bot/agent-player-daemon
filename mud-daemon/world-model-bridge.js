'use strict';
// world-model-bridge.js — Wires GMCP events and text parsing into
// the WorldModel. Acts as the perception adapter between raw game
// data and structured world state.
//
// For MUDs: wires GMCP + text patterns.
// For visual games (future): would wire screen capture + CV.

class WorldModelBridge {
  constructor(options = {}) {
    this.worldModel = options.worldModel;
    this.serverProfile = options.serverProfile;
    this.log = options.log || ((type, msg) => console.log(`[Bridge:${type}] ${msg}`));
  }

  // Wire all GMCP event handlers
  wireGmcp(gmcpHandler) {
    const wm = this.worldModel;

    // --- Character vitals — config-driven field mapping ---
    gmcpHandler.on('char.vitals', (data) => {
      const map = this.serverProfile ? this.serverProfile.gmcpVitalsMap : null;
      const updates = {};
      if (map) {
        for (const [gmcpField, modelField] of Object.entries(map)) {
          if (data[gmcpField] !== undefined) {
            const val = parseInt(data[gmcpField]);
            if (!isNaN(val)) updates[modelField] = val;
          }
        }
      } else {
        // Fallback: pass through all numeric fields as-is
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string' && /^\d+$/.test(v)) updates[k] = parseInt(v);
          else if (typeof v === 'number') updates[k] = v;
        }
      }
      wm.updateSelf(updates);
    });

    // --- Character status (level, combat state, TNL) ---
    gmcpHandler.on('char.status', (data) => {
      const updates = {};
      if (data.level !== undefined) updates.level = parseInt(data.level) || wm.self.level;
      if (data.tnl !== undefined) updates.tnl = parseInt(data.tnl) || 0;
      if (data.enemy !== undefined) {
        const enemyName = (typeof data.enemy === 'string') ? data.enemy.trim() : '';
        updates.inCombat = enemyName.length > 0;
        updates.currentTarget = enemyName || null;
      }
      // Map numeric state to named state via server profile
      if (data.state !== undefined && this.serverProfile && this.serverProfile.gmcpStateMap) {
        const mapped = this.serverProfile.gmcpStateMap[String(data.state)];
        if (mapped) updates.state = mapped;
      }
      wm.updateSelf(updates);
    });

    // --- Character max stats (Aardwolf sends these separately from vitals) ---
    gmcpHandler.on('char.maxstats', (data) => {
      const map = this.serverProfile ? this.serverProfile.gmcpVitalsMap : null;
      const updates = {};
      if (map) {
        for (const [gmcpField, modelField] of Object.entries(map)) {
          if (data[gmcpField] !== undefined) {
            const val = parseInt(data[gmcpField]);
            if (!isNaN(val)) updates[modelField] = val;
          }
        }
      } else {
        if (data.maxhp !== undefined) updates.maxHp = parseInt(data.maxhp) || 0;
        if (data.maxmana !== undefined) updates.maxMana = parseInt(data.maxmana) || 0;
        if (data.maxmoves !== undefined) updates.maxMoves = parseInt(data.maxmoves) || 0;
      }
      wm.updateSelf(updates);
    });

    // --- Character base info ---
    gmcpHandler.on('char.base', (data) => {
      const updates = {};
      if (data.name) updates.name = data.name;
      if (data.class) updates.class = data.class;
      if (data.subclass) updates.subclass = data.subclass;
      if (data.race) updates.race = data.race;
      if (data.level) updates.level = parseInt(data.level) || wm.self.level;
      wm.updateSelf(updates);
    });

    // --- Character worth (gold, QP, etc.) ---
    gmcpHandler.on('char.worth', (data) => {
      const updates = {};
      if (data.gold !== undefined) updates.gold = parseInt(data.gold) || 0;
      if (data.qp !== undefined) updates.questPoints = parseInt(data.qp) || 0;
      wm.updateSelf(updates);
    });

    // --- Room info (builds the room graph) ---
    gmcpHandler.on('room.info', (data) => {
      // Room ID: use 'num' (Aardwolf/Achaea) or 'identifier' (Discworld) or fallback to name hash
      const rawId = data.num ?? data.identifier ?? null;
      if (!rawId && rawId !== 0) return;
      const roomId = String(rawId);

      // Convert exits from {n: vnum, s: vnum} to {n: "vnum", s: "vnum"}
      const exits = {};
      if (data.exits) {
        for (const [dir, vnum] of Object.entries(data.exits)) {
          exits[dir] = String(vnum);
        }
      }

      wm.updateRoom({
        id: roomId,
        name: data.name || 'unknown',
        zone: data.zone || 'unknown',
        exits,
        terrain: data.terrain || null,
        details: data.details || null,
      });

      this.log('WORLD', `Room: ${data.name} [${data.zone}] (${wm.getRoomCount()} rooms mapped)`);
    });

    // --- Group data ---
    gmcpHandler.on('group', (data) => {
      // Aardwolf sends group data as a single object with members array
      if (data.groupname !== undefined || data.members) {
        wm.updateParty(data);
        if (data.members && data.members.length > 0) {
          this.log('WORLD', `Party: ${data.groupname || 'unnamed'} (${data.members.length} members)`);
        }
      }
    });

    // --- Channel messages (format varies by game) ---
    gmcpHandler.on('comm.channel', (data) => {
      const format = this.serverProfile ? this.serverProfile.gmcpChannelFormat : 'auto';
      let parsed = data;
      if (format === 'double-encoded' || (format === 'auto' && typeof data === 'string')) {
        try { parsed = JSON.parse(data); } catch { return; }
      }
      if (parsed && (parsed.chan || parsed.channel)) {
        const channel = parsed.chan || parsed.channel;
        const player = parsed.player || parsed.talker || 'unknown';
        const msg = (parsed.msg || parsed.text || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
        wm.recordChannelMessage(channel, player, msg);
      }
    });

    // --- Quest status ---
    gmcpHandler.on('comm.quest', (data) => {
      if (data && data.action) {
        wm.recordEvent({
          type: 'quest',
          detail: `Quest ${data.action}: ${data.status || ''}`.trim(),
        });
      }
    });
  }

  // Wire game state engine events into world model
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

  // Wire file-IPC data (structured JSON from visual games like Caves of Qud).
  // The connection emits 'data' with a parsed JSON object each poll cycle.
  // This is the file-IPC equivalent of wireGmcp() — maps game state to world model.
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

  // Wire text-based perception (kill detection, etc.)
  // Called from daemon.js data handler alongside gameState.processText()
  processText(text) {
    const wm = this.worldModel;

    // Kill detection (supplements game-state.js detection)
    if (this.serverProfile && this.serverProfile.combatPatterns.mobDied) {
      const deathMatch = text.match(this.serverProfile.combatPatterns.mobDied);
      if (deathMatch) {
        wm.self.killCount = (wm.self.killCount || 0) + 1;
        wm.recordEvent({
          type: 'kill',
          detail: `${deathMatch[1]} slain (kill #${wm.self.killCount})`,
        });
      }
    }

    // Level-up detection
    if (this.serverProfile && this.serverProfile.combatPatterns.levelUp) {
      if (this.serverProfile.combatPatterns.levelUp.test(text)) {
        wm.recordEvent({
          type: 'level_up',
          detail: `Leveled up`,
        });
      }
    }

    // --- Text-based room detection (for non-GMCP games) ---
    // Only runs if GMCP room.info hasn't updated recently (avoids double-tracking)
    if (this.serverProfile && this.serverProfile.exitPattern) {
      const exitMatch = text.match(this.serverProfile.exitPattern);
      if (exitMatch) {
        // Extract exit directions — need the full line, not just the match
        // Find the line containing the exit pattern
        const matchIdx = text.indexOf(exitMatch[0]);
        const lineStart = text.lastIndexOf('\n', matchIdx) + 1;
        const lineEnd = text.indexOf('\n', matchIdx + exitMatch[0].length);
        const exitText = text.substring(lineStart, lineEnd > 0 ? lineEnd : text.length);
        const directions = ['north', 'south', 'east', 'west', 'up', 'down',
          'northeast', 'northwest', 'southeast', 'southwest'];
        const exits = {};
        for (const dir of directions) {
          if (exitText.toLowerCase().includes(dir)) {
            exits[dir.substring(0, 1)] = 'unknown'; // no vnum available from text
          }
        }

        // Try to extract room name from the line(s) before the exit line
        const lines = text.split('\n');
        let roomName = null;
        for (let i = 0; i < lines.length; i++) {
          if (this.serverProfile.exitPattern.test(lines[i])) {
            // Room name is typically the first non-empty line of the room description
            for (let j = Math.max(0, i - 10); j < i; j++) {
              const trimmed = lines[j].trim();
              // Room name heuristic: short line, possibly with period, at the start of description
              if (trimmed && trimmed.length < 80 && trimmed.length > 2 &&
                  !trimmed.startsWith('[') && !trimmed.startsWith('Hp:') &&
                  !trimmed.startsWith('>')) {
                roomName = trimmed.replace(/\.$/, ''); // remove trailing period
                break;
              }
            }
            break;
          }
        }

        if (roomName && Object.keys(exits).length > 0) {
          // Generate a text-based room ID (hash of name since no vnum available)
          const roomId = 'text-' + roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
          const currentRoom = wm.getCurrentRoom();

          // Only update if this looks like a different room
          if (!currentRoom || currentRoom.name !== roomName) {
            wm.updateRoom({
              id: roomId,
              name: roomName,
              zone: 'unknown',
              exits,
            });
            this.log('TEXT', `Room detected: ${roomName} (${Object.keys(exits).length} exits)`);
          }
        }
      }
    }
  }
}

module.exports = { WorldModelBridge };
