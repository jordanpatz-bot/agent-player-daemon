# MUD Daemon — Phase 1

Persistent MUD client daemon. Replaces fire-and-forget session-runner with a long-running process.

## Architecture

```
┌─────────────┐     file IPC      ┌──────────────┐     TCP      ┌───────────┐
│  Mico (LLM) │ ───────────────── │  mud-daemon   │ ──────────── │ MUD Server│
│             │  commands/results  │              │   telnet     │           │
└─────────────┘                    └──────────────┘              └───────────┘
                                         │
                                    blackboard.json (persistent state)
                                    output-buffer.txt (recent output)
```

## Components

- `daemon.js` — Main entry point. Long-running process, manages lifecycle.
- `connection.js` — TCP socket with reconnect logic, login state machine, telnet negotiation.
- `blackboard-store.js` — Persistent blackboard with TTL fields. Saves to disk, loads on startup.
- `ipc.js` — File-based command interface. Watches for command files, writes results.
- `state-machine.js` — Game state machine (idle/hunting/combat/social). Phase 2 skeleton.
- `parsers.js` — Shared parsers extracted from session-runner (room, prompt, events).

## IPC Protocol

Commands: Write JSON to `ipc/commands/<timestamp>.json`
```json
{ "id": "cmd-123", "commands": ["kill rat", "get all corpse"], "waitFor": "is slain", "timeout": 15000 }
```

Results: Daemon writes to `ipc/results/<id>.json`
```json
{ "id": "cmd-123", "status": "complete", "output": "...", "events": [...], "blackboard": {...} }
```

## Running

```bash
node mud-daemon/daemon.js --game aardwolf
# Or via PM2:
pm2 start mud-daemon/daemon.js --name mud-aardwolf -- --game aardwolf
```
