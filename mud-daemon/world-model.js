'use strict';
// world-model.js — Perception-agnostic world state model.
// Replaces the flat blackboard for game state. Tracks entities, rooms,
// timeline events, channels, party, and inventory.
//
// Location IDs are abstract strings: vnums for MUDs, coordinates for visual games.
// Entity types: 'mob', 'npc', 'player', 'item', 'party_member'

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { atomicWriteJSON } = require('./atomic-write');

class WorldModel extends EventEmitter {
  constructor(options = {}) {
    super();
    this.persistPath = options.persistPath || null;
    this._saveTimer = null;
    this._saveDebounceMs = options.saveDebounceMs || 10000;

    // --- Self entity ---
    this.self = {
      name: options.name || 'unknown',
      level: options.level || 1,
      class: options.class || 'unknown',
      subclass: options.subclass || '',
      race: options.race || 'unknown',
      hp: 0, maxHp: 0,
      mana: 0, maxMana: 0,
      moves: 0, maxMoves: 0,
      tnl: 0,
      gold: 0,
      questPoints: 0,
      inCombat: false,
      currentTarget: null,
      killCount: 0,
      locationId: null, // current room ID (string)
      state: 'idle',    // idle, combat, sleep, resting, etc.
      following: null,   // who we're following (name or null)
    };

    // --- Entities (mobs, NPCs, players, items visible in world) ---
    this._entities = new Map(); // id → entity

    // --- Room graph (accumulated from exploration) ---
    this._rooms = new Map(); // locationId (string) → Room

    // --- Party / group ---
    this.party = {
      name: null,
      leader: null,
      members: [], // [{ name, hp, maxHp, mana, maxMana, class, level }]
    };

    // --- Timeline (recent events) ---
    this._timeline = [];
    this._maxTimelineEvents = 200;

    // --- Channel history ---
    this._channels = {}; // channelName → [{ player, message, at }]
    this._maxChannelMessages = 50;

    // --- Inventory ---
    this._inventory = []; // [{ name, type?, count? }]

    // Load persisted state if available
    this._load();
  }

  // --- Self ---

  updateSelf(fields) {
    let changed = false;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && this.self[k] !== v) {
        this.self[k] = v;
        changed = true;
      }
    }
    if (changed) {
      this.emit('self:changed', this.self);
      this._scheduleSave();
    }
  }

  // --- Entities ---

  addEntity(entity) {
    if (!entity.id) entity.id = `${entity.type}-${entity.name}-${Date.now()}`;
    entity.lastSeen = Date.now();
    this._entities.set(entity.id, entity);
    this.emit('entity:added', entity);
    return entity.id;
  }

  removeEntity(id) {
    const entity = this._entities.get(id);
    if (entity) {
      this._entities.delete(id);
      this.emit('entity:removed', entity);
    }
  }

  getEntity(id) {
    return this._entities.get(id) || null;
  }

  getEntitiesByType(type) {
    return [...this._entities.values()].filter(e => e.type === type);
  }

  getEntitiesInRoom(locationId) {
    const loc = locationId || this.self.locationId;
    return [...this._entities.values()].filter(e => e.locationId === loc);
  }

  // Clear entities in a room (used before re-populating from room look)
  clearEntitiesInRoom(locationId) {
    for (const [id, entity] of this._entities) {
      if (entity.locationId === locationId) {
        this._entities.delete(id);
      }
    }
  }

  // --- Rooms ---

  updateRoom(roomData) {
    if (!roomData.id) return;
    const id = String(roomData.id);
    const existing = this._rooms.get(id);
    const room = {
      ...(existing || {}),
      id,
      name: roomData.name || (existing && existing.name) || 'unknown',
      zone: roomData.zone || (existing && existing.zone) || 'unknown',
      exits: roomData.exits || (existing && existing.exits) || {},
      terrain: roomData.terrain || (existing && existing.terrain) || null,
      details: roomData.details || (existing && existing.details) || null,
      visitedAt: Date.now(),
    };
    this._rooms.set(id, room);

    // Update self location
    this.self.locationId = id;

    this.emit('room:updated', room);
    this._scheduleSave();
    return room;
  }

  getRoom(id) {
    return this._rooms.get(String(id)) || null;
  }

  getCurrentRoom() {
    if (!this.self.locationId) return null;
    return this._rooms.get(String(this.self.locationId)) || null;
  }

  getAdjacentRooms() {
    const current = this.getCurrentRoom();
    if (!current || !current.exits) return [];
    return Object.entries(current.exits).map(([dir, targetId]) => ({
      direction: dir,
      room: this._rooms.get(String(targetId)) || { id: String(targetId), name: 'unexplored' },
    }));
  }

  getRoomGraph() {
    return new Map(this._rooms);
  }

  getRoomCount() {
    return this._rooms.size;
  }

  // BFS shortest path between two rooms. Returns direction array or null.
  findPath(fromId, toId, maxDepth = 30) {
    fromId = String(fromId);
    toId = String(toId);
    if (fromId === toId) return [];

    const visited = new Set([fromId]);
    const queue = [{ id: fromId, path: [] }];

    while (queue.length > 0) {
      const { id, path: currentPath } = queue.shift();
      if (currentPath.length >= maxDepth) continue;

      const room = this._rooms.get(id);
      if (!room || !room.exits) continue;

      for (const [dir, targetId] of Object.entries(room.exits)) {
        const tid = String(targetId);
        if (tid === toId) return [...currentPath, dir];
        if (!visited.has(tid)) {
          visited.add(tid);
          queue.push({ id: tid, path: [...currentPath, dir] });
        }
      }
    }
    return null; // no path found
  }

  // --- Party ---

  updateParty(partyData) {
    if (partyData.groupname !== undefined) this.party.name = partyData.groupname || null;
    if (partyData.leader) this.party.leader = partyData.leader;
    if (partyData.members && Array.isArray(partyData.members)) {
      this.party.members = partyData.members.map(m => ({
        name: m.name,
        hp: m.info ? m.info.hp : m.hp,
        maxHp: m.info ? m.info.mhp : m.maxHp,
        mana: m.info ? m.info.mn : m.mana,
        maxMana: m.info ? m.info.mmn : m.maxMana,
        moves: m.info ? m.info.mv : m.moves,
        class: m.class || null,
        level: m.level || null,
      }));
    }
    this.emit('party:changed', this.party);
    this._scheduleSave();
  }

  getPartyMember(name) {
    return this.party.members.find(m => m.name === name) || null;
  }

  // --- Timeline ---

  recordEvent(event) {
    const entry = {
      type: event.type,
      detail: event.detail || '',
      locationId: event.locationId || this.self.locationId,
      state: event.state || this.self.state,
      at: event.at || new Date().toISOString(),
    };
    this._timeline.push(entry);
    if (this._timeline.length > this._maxTimelineEvents) {
      this._timeline = this._timeline.slice(-this._maxTimelineEvents);
    }
    this.emit('event', entry);
    this._scheduleSave();
    return entry;
  }

  getEvents(filter = {}) {
    let events = this._timeline;
    if (filter.type) events = events.filter(e => e.type === filter.type);
    if (filter.since) events = events.filter(e => new Date(e.at) >= new Date(filter.since));
    if (filter.locationId) events = events.filter(e => e.locationId === filter.locationId);
    if (filter.limit) events = events.slice(-filter.limit);
    return events;
  }

  getRecentEvents(n = 20) {
    return this._timeline.slice(-n);
  }

  // --- Channels ---

  recordChannelMessage(channel, player, message) {
    if (!channel) return;
    if (!this._channels[channel]) this._channels[channel] = [];
    const entry = { player, message, at: new Date().toISOString() };
    this._channels[channel].push(entry);
    if (this._channels[channel].length > this._maxChannelMessages) {
      this._channels[channel] = this._channels[channel].slice(-this._maxChannelMessages);
    }
    this.emit('channel:message', { channel, ...entry });
  }

  getChannelHistory(channel, limit = 20) {
    const msgs = this._channels[channel] || [];
    return msgs.slice(-limit);
  }

  getAllChannels() {
    return Object.keys(this._channels);
  }

  // --- Inventory ---

  updateInventory(items) {
    this._inventory = items || [];
    this.emit('inventory:changed', this._inventory);
    this._scheduleSave();
  }

  addItem(item) {
    this._inventory.push(item);
    this.emit('inventory:changed', this._inventory);
  }

  removeItem(name) {
    const idx = this._inventory.findIndex(i => i.name === name);
    if (idx !== -1) this._inventory.splice(idx, 1);
    this.emit('inventory:changed', this._inventory);
  }

  getInventory() {
    return [...this._inventory];
  }

  // --- Snapshot (for IPC results) ---

  snapshot() {
    const currentRoom = this.getCurrentRoom();
    return {
      self: { ...this.self },
      currentRoom: currentRoom ? { ...currentRoom } : null,
      party: {
        name: this.party.name,
        leader: this.party.leader,
        members: this.party.members.map(m => ({ ...m })),
      },
      roomsExplored: this._rooms.size,
      recentEvents: this._timeline.slice(-20),
      channels: Object.fromEntries(
        Object.entries(this._channels).map(([ch, msgs]) => [ch, msgs.slice(-5)])
      ),
      inventory: [...this._inventory],
      entitiesInRoom: this.getEntitiesInRoom().map(e => ({
        id: e.id, type: e.type, name: e.name,
      })),
    };
  }

  // --- Persistence ---

  save() {
    if (!this.persistPath) return;
    const data = {
      self: this.self,
      rooms: Object.fromEntries(this._rooms),
      party: this.party,
      timeline: this._timeline.slice(-100),
      channels: this._channels,
      inventory: this._inventory,
      savedAt: new Date().toISOString(),
    };
    try { atomicWriteJSON(this.persistPath, data); }
    catch { /* non-fatal */ }
  }

  saveNow() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.save();
  }

  _load() {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
      // Restore rooms (the main persistent value — spatial memory)
      if (raw.rooms) {
        for (const [id, room] of Object.entries(raw.rooms)) {
          this._rooms.set(id, room);
        }
      }
      // Restore timeline
      if (raw.timeline) this._timeline = raw.timeline;
      // Restore channels
      if (raw.channels) this._channels = raw.channels;
      // Restore inventory
      if (raw.inventory) this._inventory = raw.inventory;
      // Restore kill count from self (durable)
      if (raw.self && raw.self.killCount) this.self.killCount = raw.self.killCount;
    } catch {
      // Corrupted file — start fresh
    }
  }

  _scheduleSave() {
    if (!this.persistPath) return;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, this._saveDebounceMs);
  }
}

module.exports = { WorldModel };
