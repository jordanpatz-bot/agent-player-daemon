# Caves of Qud Autonomous Agent System

An AI agent that plays Caves of Qud autonomously, using Claude as its decision engine and a C# mod as its interface to the game.

## Architecture Overview

The system has three layers:

1. **C# Mod (AgentBridge)** — runs inside Qud's Unity process, exposes game state and accepts commands via file IPC
2. **Agent Script (qud-agent.js)** — Node.js process that reads game state, calls Claude for decisions, sends commands, and loops
3. **MUD Daemon (mud-daemon/)** — shared game-AI infrastructure (behavior trees, state machines, reflexes) originally built for MUD text games, planned integration target for Qud

The agent communicates directly with the game through the file IPC layer, bypassing the daemon for now. The long-term goal is to integrate the agent's behavior modes into the daemon's shared architecture so they work across MUDs, Qud, and eventually 2D MMOs via machine vision.

---

## C# Mod — AgentBridge

**Location:** `~/Library/Application Support/com.FreeholdGames.CavesOfQud/Mods/AgentBridge/AgentBridge.cs`

The mod consists of three components:

### AgentBridgeMutator
`[PlayerMutator]` that attaches the bridge to the player at game start and creates the background command poller. Sets `Application.runInBackground = true` so the game processes commands even when unfocused.

### AgentPoller (MonoBehaviour)
Runs in Unity's `Update()` loop every 0.5 seconds. Handles:
- **Popup dismissal** — uses reflection to find and clear Qud's popup/notification system (4 strategies: Popup static fields, keyboard buffer injection, GameManager fields, Options system). Prevents popups from blocking game input while the agent is playing.
- **Command processing** — reads `command.txt`, calls `ExecuteCommand()`, writes `result.json` and refreshes `state.json`.

### AgentBridgePart (IPart)
Attached to the player object. Runs `TurnTick()` each game turn as a backup command processor. Writes `state.json` (full game state) and `screen.txt` (ASCII rendering of visible area) every turn.

### Command Router (ExecuteCommand)

| Command | Description | Implementation |
|---------|-------------|----------------|
| `navigate <name\|x y>` | A* pathfind to target, auto-moves along path | Custom A* with hostile-only blocking, 80-step max |
| `talkto <name>` | Walk to NPC + initiate conversation | Pathfind adjacent, load conversation from Conversations.xml |
| `choose <N>` | Select dialog choice by index | Navigate XML conversation tree, track current node |
| `move <dir>` | Move one tile (n/s/e/w/ne/nw/se/sw) | `player.Move(dir)` + `UseEnergy(1000)` |
| `attack <name\|dir>` | Attack target (currently broken — sets target only) | `player.Target = target` (no actual swing) |
| `trade <name>` | View merchant inventory | Read NPC's `Inventory.Objects` |
| `examine <name>` | Inspect entity/item | Searches inventory, equipment, then zone objects |
| `eat` / `drink` | Consume food/water from inventory | Matches item names, fires `InvCommandEat`/`InvCommandDrink` |
| `equip <item>` | Equip inventory item | `player.ForceEquipObject()` |
| `pickup <item>` | Pick up ground item | `player.TakeObject()` |
| `activate <ability>` | Use mutation or activated ability | Reflection-based discovery of ability dictionary |
| `status` | Full character dump (stats, mutations, abilities, skills) | Reads all player parts via reflection |
| `rest` | Rest until healed | Maps to `CmdWaitUntilHealed` |
| `save` | Save game | Maps to `CmdSave` |
| Other | Mapped to Qud internal command IDs | `cmdMap` lookup → `player.FireEvent()` |

### Pathfinding (FindPath)
Custom A* implementation operating on the current zone's cell grid. Only blocks hostile creatures (friendly NPCs are walkable). Searches adjacent cells if direct path to target fails. Max 80 steps.

### Conversation System
Parses `Conversations.xml` from Qud's StreamingAssets. Loads conversation by NPC's `ConversationScript.ConversationID`. Traverses nodes via `<choice Target="NodeID">` attributes. Tracks current position with static `_currentConvXml` and `_currentNodeId`.

**Limitation:** Static XML parsing only. Does not fire Qud's runtime conversation events, so quests are never formally accepted by the game. Procedurally generated NPCs (non-Joppa villages) have no conversation data in the XML and cannot be talked to.

### State Output (state.json)
Written every turn. Contains:
```json
{
  "stats": { "Hitpoints": {"value":18,"base":18,"max":64000}, ... },
  "turn": 61525,
  "name": "Oariwdxe",
  "level": 1, "hp": 18, "maxHp": 18, "xp": 0, "av": 2, "dv": -1,
  "position": {"x": 37, "y": 22},
  "zone": "JoppaWorld.11.22.1.1.10",
  "zoneName": "Joppa",
  "exits": {"N": true, "S": true, ...},
  "entities": [{"name":"Elder Irudad","x":38,"y":3,"hostile":false,"hp":225,"maxHp":225}, ...],
  "adjacent": [{"name":"Tam","direction":"E","hostile":false,"hasTrade":true,"hasConversation":true}],
  "inventory": ["waterskin [32 drams of fresh water]", ...],
  "equipment": {"Body": "furs", "Hand (1)": "bronze battle axe", ...},
  "mutations": [], "skills": [], "effects": [], "quests": [], "messages": []
}
```

---

## Agent Script — qud-agent.js

**Location:** `~/mud-daemon-gamestate/qud-agent.js`
**Usage:** `node qud-agent.js [--turns N] [--model MODEL]`

### Main Loop
Each turn:
1. Read `state.json` for current game state
2. Update zone map and position history
3. Check stuck detection
4. Emergency heal if HP < 50%
5. Pick model (haiku default, sonnet for complex decisions)
6. Build prompt with state summary, zone map, recent history, last results
7. Call `claude -p --model <model>` for decision
8. Parse JSON response
9. Execute behavior mode or manual plan
10. Record in journal, check for death

### LLM Integration
Uses `claude -p` (Claude Code CLI in non-interactive mode) as the decision engine.

**Model selection (pickModel):**
- **Haiku (default)** — routine movement, simple commands
- **Sonnet (escalation)** — conversations with >2 choices, new zones, stuck detection, low HP

**Prompt structure:**
- System prompt: available commands, conversation rules, navigation tips, quest priority guidance, village guide
- User prompt: current state summary, objectives, zone map, recent history, last plan results, stuck warnings

**Response format:**
```json
{"reasoning": "what and why", "objectives": ["goals"], "mode": "manual|hunt|explore|heal|shop", "steps": [{"command": "cmd"}], "params": {"maxSteps": 15}}
```

### Behavior Modes (No LLM)
Autonomous loops that execute without calling Claude:

| Mode | Behavior |
|------|----------|
| `hunt` | Find weakest hostile in entities, move into it (melee attack), flee if HP<30%, track kills |
| `explore` | Wander zone in pattern, auto-hunt if hostile within 5 tiles, detect zone transitions |
| `heal` | Eat food, drink water, rest until healed |
| `shop` | Navigate to merchant, view trade inventory |

### Zone Map
Persistent map of visited zones stored in `journal.zoneMap`. Tracks:
- Zone ID, name, visit count
- Entry position and inferred direction
- Notable NPCs (deduplicated across visits)
- Hostile count at time of visit
- Bidirectional connections to adjacent zones

Summarized in LLM prompt so the agent can navigate back to known locations.

### Stuck Detection
Two mechanisms:
- **Position stuck:** Last 5 positions all within 3 tiles of each other → inject warning into prompt
- **Nav fail streak:** 3+ consecutive `navigate` failures → warn LLM to use manual `move` commands

Both trigger Sonnet escalation for smarter decision-making.

### Persistence
- `qud-journal.json` — turn log, objectives, zone map, position history, death count
- `qud-agent.log` — full session log with timestamps
- `reports/*.md` — session summary reports

---

## File IPC Protocol

**Directory:** `~/mud-daemon-gamestate/mud-daemon/data/qud/ipc/`

| File | Direction | Purpose |
|------|-----------|---------|
| `command.txt` | Agent → Game | Single command string, deleted after processing |
| `result.json` | Game → Agent | Structured result of last command |
| `state.json` | Game → Agent | Full game state, updated every turn |
| `screen.txt` | Game → Agent | ASCII rendering of visible area |
| `debug.log` | Game | Mod debug output |
| `tick.txt` | Game | TurnTick heartbeat |

All writes are atomic (write .tmp, rename). The agent clears `result.json` before sending a command, then polls for it to reappear.

---

## MUD Daemon (Future Integration Target)

**Location:** `~/mud-daemon-gamestate/mud-daemon/`
**Status:** PM2 process "mud-qud" exists but crash-loops on a stale lock file. Not currently used by the Qud agent.

The daemon was built for MUD text games (Aardwolf, Discworld) and provides:
- `QudConnection` — file IPC adapter matching the MudConnection interface
- `IpcServer/IpcClient` — 3-file IPC protocol (commands/ack/results directories)
- `ipc-handler.js` — plan executor with sequential step execution and failure detection
- `world-model.js` — state tracking (designed for MUD text, partially adapted for Qud)
- `behavior-tree.js` — behavior tree engine
- `reflex-engine.js` — pattern→action rules
- `state-audit.js` — anomaly detection
- `game-state.js` — connection state machine
- `conversation-middleware.js` — MUD social/chat handling
- `tactics.js` — group combat roles

**Planned direction:** Port the agent's behavior modes (hunt, explore, heal, shop) into `behavior-tree.js` so they work as shared infrastructure across all game types. The daemon becomes the autonomous execution layer; the LLM agent sends high-level directives.

---

## Automation Scripts

| Script | Purpose |
|--------|---------|
| `qud-newgame.sh` | Kill Qud → relaunch → random character creation → wait for game state |
| `qud-autopilot.sh` | Legacy: sends keystrokes to Qud window to advance turns |
| `ipc-send.js` | CLI tool to send commands to the daemon's 3-file IPC |

---

## Known Issues

1. **Conversations don't trigger quests** — static XML parsing reads dialog text but doesn't fire Qud's quest system events. The quest journal stays empty. The LLM tracks quests internally based on dialog text.
2. **Procedural NPC conversations fail** — randomly generated village NPCs (non-Joppa) have no conversation data in Conversations.xml. Their `ConversationID` returns "unknown".
3. **Attack command is broken** — `attack <name>` sets `player.Target` but doesn't actually perform a melee attack. Workaround: `move <dir>` into the hostile (Qud attacks on move-into-hostile).
4. **Popup blocking untested** — C# reflection-based popup dismissal added but not yet verified against actual Qud popups. Previously used osascript keystrokes (removed — sent keystrokes to wrong app).
5. **Explore mode zone bouncing** — the movement pattern in explore mode triggers zone transitions back and forth at zone edges.
6. **Sonnet escalation too aggressive** — stuck detection is "sticky" (nav fail streak doesn't reset quickly enough), causing Sonnet to be used more than necessary.
7. **No world map knowledge** — the agent doesn't know where named locations (Red Rock, Grit Gate, Six Day Stilt) are on the world map. It can only discover zones by walking into them.
8. **Daemon stale lock** — `mud-daemon/data/qud/daemon.lock` needs cleanup before the daemon can run.

---

## Test Results Summary

**Best session (55 total turns across runs):**
- Talked to all 3 key Joppa NPCs (Elder Irudad, Argyve, Mehmet)
- Chose correct quest dialog options ("I'm looking for work" = index 3)
- Completed Argyve's full 5-step conversation chain → accepted knickknack quest
- Advanced Irudad's main story through GyreWight lore chain
- Killed 4 snapjaw scavengers in autonomous hunt mode
- Explored multiple zones (salt marshes, desert canyons, Joppa outskirts)
- Navigated zone transitions and returned to Joppa using zone map
- Zero deaths in final session, full HP throughout
- Haiku/Sonnet hybrid: ~30% cheaper than all-Sonnet
