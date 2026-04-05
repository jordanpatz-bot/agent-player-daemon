'use strict';
// text-bridge.js — Text-based perception adapter.
// Parses raw game text for kill detection, level-ups, and room detection.
// MUD-specific: regex patterns, cardinal directions, heuristic room names.

/**
 * Process raw game text to extract structured events.
 * @param {string} text — raw text from game output
 * @param {WorldModel} worldModel
 * @param {object} serverProfile — game-specific regex patterns
 * @param {function} log — (type, msg) logger
 */
function processText(text, worldModel, serverProfile, log) {
  const wm = worldModel;

  // Kill detection (supplements game-state.js detection)
  if (serverProfile && serverProfile.combatPatterns.mobDied) {
    const deathMatch = text.match(serverProfile.combatPatterns.mobDied);
    if (deathMatch) {
      wm.self.killCount = (wm.self.killCount || 0) + 1;
      wm.recordEvent({
        type: 'kill',
        detail: `${deathMatch[1]} slain (kill #${wm.self.killCount})`,
      });
    }
  }

  // Level-up detection
  if (serverProfile && serverProfile.combatPatterns.levelUp) {
    if (serverProfile.combatPatterns.levelUp.test(text)) {
      wm.recordEvent({
        type: 'level_up',
        detail: `Leveled up`,
      });
    }
  }

  // --- Text-based room detection (for non-GMCP games) ---
  // Only runs if GMCP room.info hasn't updated recently (avoids double-tracking)
  if (serverProfile && serverProfile.exitPattern) {
    const exitMatch = text.match(serverProfile.exitPattern);
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
        if (serverProfile.exitPattern.test(lines[i])) {
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
          log('TEXT', `Room detected: ${roomName} (${Object.keys(exits).length} exits)`);
        }
      }
    }
  }
}

module.exports = { processText };
