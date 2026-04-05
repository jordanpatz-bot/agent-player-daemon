'use strict';
// gmcp-bridge.js — GMCP perception adapter.
// Wires GMCP event handlers into the WorldModel.
// MUD-specific: field mappings, state enums, channel formats, room vnums.

/**
 * Wire all GMCP event handlers to update the world model.
 * @param {EventEmitter} gmcpHandler — emits GMCP events
 * @param {WorldModel} worldModel
 * @param {object} serverProfile — game-specific field mappings
 * @param {function} log — (type, msg) logger
 */
function wireGmcp(gmcpHandler, worldModel, serverProfile, log) {
  const wm = worldModel;

  // --- Character vitals — config-driven field mapping ---
  gmcpHandler.on('char.vitals', (data) => {
    const map = serverProfile ? serverProfile.gmcpVitalsMap : null;
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
    if (data.state !== undefined && serverProfile && serverProfile.gmcpStateMap) {
      const mapped = serverProfile.gmcpStateMap[String(data.state)];
      if (mapped) updates.state = mapped;
    }
    wm.updateSelf(updates);
  });

  // --- Character max stats (Aardwolf sends these separately from vitals) ---
  gmcpHandler.on('char.maxstats', (data) => {
    const map = serverProfile ? serverProfile.gmcpVitalsMap : null;
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

    log('WORLD', `Room: ${data.name} [${data.zone}] (${wm.getRoomCount()} rooms mapped)`);
  });

  // --- Group data ---
  gmcpHandler.on('group', (data) => {
    // Aardwolf sends group data as a single object with members array
    if (data.groupname !== undefined || data.members) {
      wm.updateParty(data);
      if (data.members && data.members.length > 0) {
        log('WORLD', `Party: ${data.groupname || 'unnamed'} (${data.members.length} members)`);
      }
    }
  });

  // --- Channel messages (format varies by game) ---
  gmcpHandler.on('comm.channel', (data) => {
    const format = serverProfile ? serverProfile.gmcpChannelFormat : 'auto';
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

module.exports = { wireGmcp };
