# GMCP Pipeline Fix — Not Wired In

## Problem
`gmcp.processRaw()` exists but is never called. GMCP subnegotiations leak into the
text output as garbage (`comm.tick {"ctime":...}` visible in output-buffer.txt).

`room.info` events never fire, so `currentRoom` is always "unknown".

## Root Cause
connection.js calls `socket.setEncoding('utf8')` on line 41, which converts raw bytes
to strings before the GMCP handler can process binary subnegotiation sequences
(IAC SB 0xC9 ... IAC SE). The binary GMCP framing bytes get mangled by UTF-8 decoding.

## What Needs to Change
1. Remove `setEncoding('utf8')` from connection.js — receive raw Buffers
2. Emit a `rawData` event with the raw Buffer before cleaning
3. In daemon.js, wire `gmcp.processRaw(rawBuffer)` into the pipeline
4. processRaw strips GMCP subneg sequences, returns remaining bytes as Buffer
5. Convert remaining bytes to utf8 string, then clean ANSI/telnet as before

## Why This Isn't a Quick Fix
- Changing encoding affects every downstream consumer of socket data
- The debounce logic in connection.js concatenates strings — needs to concatenate Buffers
- Login detection regex runs on strings — needs the cleaned string, not raw bytes
- Needs end-to-end testing: login flow, reconnect, GMCP negotiation, IPC commands

## Current Workaround
Vitals come from prompt regex parsing, which works fine.
Room info is unavailable. GMCP channel events don't fire.
GMCP payloads pollute the output buffer (cosmetic noise).

## Priority
Medium-high. This unlocks room tracking and channel monitoring.
Not blocking gameplay but blocking navigation automation.
