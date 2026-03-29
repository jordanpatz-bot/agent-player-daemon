'use strict';
// gmcp.js — GMCP (Generic MUD Communication Protocol) decoder/encoder.
// Handles telnet subnegotiation for structured JSON data from MUD servers.
//
// GMCP uses telnet subnegotiation:
//   IAC SB GMCP <package.message> <json-data> IAC SE
//   (255 250 201 ... 255 240)
//
// Common Aardwolf GMCP packages:
//   char.vitals   — { hp, mana, moves, ... }
//   char.status    — { level, tnl, state (3=idle,8=combat,9=sleep), ... }
//   room.info      — { name, zone, exits: {n:vnum, s:vnum}, ... }
//   comm.channel   — { chan, player, msg }
//   char.maxstats  — { maxhp, maxmana, maxmoves }
//   group.members  — group info
//
// Usage:
//   const gmcp = new GmcpHandler();
//   gmcp.on('char.vitals', (data) => { ... });
//   gmcp.on('room.info', (data) => { ... });
//   // In socket data handler, pass raw (uncleaned) bytes:
//   gmcp.processRaw(rawBuffer);
//   // To enable GMCP, send negotiation after connect:
//   socket.write(gmcp.negotiateOn());

const EventEmitter = require('events');

const IAC = 0xFF;
const SB = 0xFA;
const SE = 0xF0;
const WILL = 0xFB;
const DO = 0xFD;
const GMCP_OPT = 201; // Telnet option code for GMCP

class GmcpHandler extends EventEmitter {
  constructor() {
    super();
    this._sbBuffer = null; // accumulates subnegotiation bytes
    this._inSB = false;
    this._prevByte = 0;
  }

  // Generate the telnet bytes to request GMCP
  negotiateOn() {
    return Buffer.from([IAC, DO, GMCP_OPT]);
  }

  // Send a GMCP message to the server
  // Returns a Buffer to write to the socket
  encode(pkg, data) {
    const payload = data !== undefined ? `${pkg} ${JSON.stringify(data)}` : pkg;
    const payloadBuf = Buffer.from(payload, 'utf8');
    const buf = Buffer.alloc(payloadBuf.length + 4);
    buf[0] = IAC;
    buf[1] = SB;
    buf[2] = GMCP_OPT;
    payloadBuf.copy(buf, 3);
    buf[buf.length - 2] = IAC;
    buf[buf.length - 1] = SE;
    // Oops, need room for trailing IAC SE
    const full = Buffer.alloc(payloadBuf.length + 5);
    full[0] = IAC;
    full[1] = SB;
    full[2] = GMCP_OPT;
    payloadBuf.copy(full, 3);
    full[full.length - 2] = IAC;
    full[full.length - 1] = SE;
    return full;
  }

  // Register desired GMCP packages with the server
  // Call after receiving WILL GMCP
  supportMessages() {
    return [
      this.encode('Core.Supports.Set', [
        'char 1', 'char.vitals 1', 'char.maxstats 1', 'char.status 1',
        'room 1', 'room.info 1',
        'comm 1', 'comm.channel 1',
        'group 1',
      ]),
    ];
  }

  // Process raw socket data (Buffer, before ANSI cleaning).
  // Extracts GMCP subnegotiations, returns the remaining bytes as a Buffer
  // (with GMCP sequences stripped).
  processRaw(buf) {
    if (typeof buf === 'string') buf = Buffer.from(buf, 'binary');

    const cleaned = [];
    let i = 0;

    while (i < buf.length) {
      const byte = buf[i];

      if (this._inSB) {
        // Inside subnegotiation — look for IAC SE
        if (this._prevByte === IAC && byte === SE) {
          // End of subnegotiation
          this._inSB = false;
          // Remove trailing IAC from buffer
          if (this._sbBuffer && this._sbBuffer.length > 0) {
            this._sbBuffer = this._sbBuffer.slice(0, -1);
          }
          this._decodeSB();
          this._sbBuffer = null;
        } else {
          if (!this._sbBuffer) this._sbBuffer = Buffer.alloc(0);
          this._sbBuffer = Buffer.concat([this._sbBuffer, Buffer.from([byte])]);
        }
        this._prevByte = byte;
        i++;
        continue;
      }

      // Check for IAC sequences
      if (this._prevByte === IAC) {
        if (byte === SB) {
          // Start of subnegotiation
          this._inSB = true;
          this._sbBuffer = Buffer.alloc(0);
          this._prevByte = 0;
          i++;
          continue;
        }
        if (byte === WILL && i + 1 < buf.length && buf[i + 1] === GMCP_OPT) {
          // Server says WILL GMCP — we respond with support list
          this.emit('gmcp-ready');
          this._prevByte = 0;
          i += 2; // skip WILL + option byte
          continue;
        }
        // Other IAC sequences — pass through to cleaned output
        cleaned.push(IAC, byte);
        this._prevByte = byte;
        i++;
        continue;
      }

      if (byte === IAC) {
        this._prevByte = byte;
        i++;
        continue;
      }

      // Normal byte
      cleaned.push(byte);
      this._prevByte = byte;
      i++;
    }

    return Buffer.from(cleaned);
  }

  _decodeSB() {
    if (!this._sbBuffer || this._sbBuffer.length === 0) return;

    // First byte should be GMCP option code
    if (this._sbBuffer[0] !== GMCP_OPT) return;

    const payload = this._sbBuffer.slice(1).toString('utf8').trim();
    const spaceIdx = payload.indexOf(' ');

    let pkg, data;
    if (spaceIdx === -1) {
      pkg = payload;
      data = {};
    } else {
      pkg = payload.substring(0, spaceIdx);
      const jsonStr = payload.substring(spaceIdx + 1);
      try {
        data = JSON.parse(jsonStr);
      } catch {
        data = jsonStr; // not valid JSON — pass as string
      }
    }

    this.emit('message', pkg, data);
    this.emit(pkg, data);
    this.emit(pkg.split('.')[0], pkg, data); // e.g. 'char' for char.vitals
  }
}

module.exports = { GmcpHandler, GMCP_OPT, IAC, SB, SE };
