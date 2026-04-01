'use strict';
// conversation-middleware.js — Social metabolism for MUD agents.
// 5-layer system: classify → score obligation → build frame → manage turns → assemble prompt.
// Default is SILENCE. Only speaks when obligation crosses threshold.

const EventEmitter = require('events');

const TAGS = {
  DIRECT_ADDRESS: 'DIRECT_ADDRESS',
  COMBAT_CALLOUT: 'COMBAT_CALLOUT',
  GROUP_AMBIENT: 'GROUP_AMBIENT',
  CHANNEL_CHATTER: 'CHANNEL_CHATTER',
  SYSTEM_SOCIAL: 'SYSTEM_SOCIAL',
  NON_SOCIAL: 'NON_SOCIAL',
};

const OBLIGATION_BASE = { high: 80, medium: 50, low: 20, none: 0 };
const OBLIGATION_THRESHOLD = 70;

class ConversationMiddleware extends EventEmitter {
  constructor(options = {}) {
    super();
    this.worldModel = options.worldModel;
    this.serverProfile = options.serverProfile;
    this.characterName = (options.characterName || '').toLowerCase();
    this.log = options.log || ((type, msg) => console.log(`[Conv:${type}] ${msg}`));

    // Compiled social patterns from server config
    this._patterns = {};
    this._channelConfigs = {};
    this._compileSocialConfig();

    // Layer 2: Obligation state
    this._pendingObligations = []; // { speaker, content, tag, score, at }
    this._maxObligations = 10;

    // Layer 3: Mood tracking
    this._lastCombatEndAt = 0;
    this._lastKillAt = 0;
    this._lastEventAt = 0;

    // Layer 4: Turn management state
    this._recentSpeakers = [];      // rolling window [{speaker, at}]
    this._windowSize = 20;
    this._ourMessageCount = 0;
    this._lastSpokeAt = 0;
    this._lastSpeakerWasUs = false;
    this._totalMessagesInWindow = 0;

    // Layer 5: Context buffer (non-obligatory classified lines)
    this._contextBuffer = [];
    this._maxContext = 10;

    // Response delay queue
    this._delayedResponses = [];
  }

  // --- Layer 1: Stream Classifier ---

  classifyLine(line) {
    if (!line || typeof line !== 'string') return { tag: TAGS.NON_SOCIAL, speaker: null, content: null, raw: line };

    const trimmed = line.trim();
    if (!trimmed) return { tag: TAGS.NON_SOCIAL, speaker: null, content: null, raw: line };

    // Check each social pattern from config
    for (const [patternName, regex] of Object.entries(this._patterns)) {
      const match = trimmed.match(regex);
      if (match) {
        const speaker = (match[1] || '').trim();
        const content = (match[2] || match[3] || '').trim();
        const channelConfig = this._channelConfigs[patternName] || {};

        // Determine tag based on channel type and context
        let tag;

        if (channelConfig.type === 'direct') {
          tag = TAGS.DIRECT_ADDRESS;
        } else if (channelConfig.type === 'room' || channelConfig.type === 'group') {
          // Check if our name is mentioned
          if (this.characterName && content.toLowerCase().includes(this.characterName)) {
            tag = TAGS.DIRECT_ADDRESS;
          } else if (this.worldModel && this.worldModel.self.inCombat) {
            tag = TAGS.COMBAT_CALLOUT;
          } else {
            tag = TAGS.GROUP_AMBIENT;
          }
        } else if (channelConfig.type === 'global') {
          if (this.characterName && content.toLowerCase().includes(this.characterName)) {
            tag = TAGS.DIRECT_ADDRESS;
          } else {
            tag = TAGS.CHANNEL_CHATTER;
          }
        } else if (channelConfig.type === 'npc') {
          tag = TAGS.NON_SOCIAL; // NPC says are gameplay, not social
        } else if (patternName === 'enter' || patternName === 'emote') {
          tag = TAGS.SYSTEM_SOCIAL;
        } else {
          tag = TAGS.GROUP_AMBIENT;
        }

        return { tag, speaker, content, channel: patternName, raw: line };
      }
    }

    return { tag: TAGS.NON_SOCIAL, speaker: null, content: null, raw: line };
  }

  // --- Layer 2: Obligation Scoring ---

  scoreObligation(classified) {
    if (!classified || classified.tag === TAGS.NON_SOCIAL) {
      return { score: 0, reasons: [] };
    }

    const reasons = [];
    let score = 0;

    // Base score from channel config
    const channelConfig = this._channelConfigs[classified.channel] || {};
    const baseObligation = channelConfig.obligation || 'none';
    score = OBLIGATION_BASE[baseObligation] || 0;
    if (score > 0) reasons.push(`base:${baseObligation}(${score})`);

    // Direct address override
    if (classified.tag === TAGS.DIRECT_ADDRESS) {
      score = Math.max(score, OBLIGATION_BASE.high);
      reasons.push('direct-address');
    }

    // Modifiers
    // Name mentioned
    if (classified.content && this.characterName &&
        classified.content.toLowerCase().includes(this.characterName)) {
      score += 20;
      reasons.push('name-mentioned(+20)');
    }

    // Question detected
    if (classified.content && classified.content.includes('?')) {
      score += 15;
      reasons.push('question(+15)');
    }

    // Responded recently (within last 2 speakers)
    if (this._recentSpeakers.length >= 1) {
      const recent = this._recentSpeakers.slice(-2);
      if (recent.some(s => s.speaker === this.characterName)) {
        score -= 30;
        reasons.push('spoke-recently(-30)');
      }
    }

    // In combat + non-combat message
    if (this.worldModel && this.worldModel.self.inCombat &&
        classified.tag !== TAGS.COMBAT_CALLOUT && classified.tag !== TAGS.DIRECT_ADDRESS) {
      score -= 25;
      reasons.push('in-combat-non-urgent(-25)');
    }

    // Long silence (haven't spoken in 4+ conversation turns)
    const turnsSinceSpoke = this._recentSpeakers.filter(s => s.speaker !== this.characterName).length;
    if (turnsSinceSpoke >= 4 && this._lastSpokeAt > 0) {
      score += 15;
      reasons.push('long-silence(+15)');
    }

    // Repeated address (same person, no response from us)
    if (classified.speaker) {
      const pending = this._pendingObligations.filter(o => o.speaker === classified.speaker);
      if (pending.length > 0) {
        score += 25;
        reasons.push('repeated-address(+25)');
      }
    }

    // Crowded room (3+ distinct speakers in window)
    const distinctSpeakers = new Set(this._recentSpeakers.map(s => s.speaker)).size;
    if (distinctSpeakers >= 3) {
      score -= 10;
      reasons.push('crowded(-10)');
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));

    return { score, reasons };
  }

  // --- Layer 3: Social Frame ---

  getSocialFrame() {
    const wm = this.worldModel;
    const now = Date.now();

    // Setting
    const room = wm ? wm.getCurrentRoom() : null;
    const partySize = wm ? (wm.party.members || []).length : 0;
    const inGroup = partySize > 0;
    const setting = inGroup
      ? `In a group of ${partySize} at ${room ? room.name : 'unknown location'}`
      : `Solo at ${room ? room.name : 'unknown location'}`;

    // Activity
    let activity;
    if (wm && wm.self.inCombat) {
      activity = 'In combat';
    } else if (this._lastCombatEndAt > 0) {
      const elapsed = Math.round((now - this._lastCombatEndAt) / 1000);
      activity = elapsed < 60 ? `Combat ended ${elapsed}s ago` : 'Exploring';
    } else {
      activity = 'Idle';
    }

    // Helpers
    const speakers = this._recentSpeakers;
    const uniqueSpeakerCount = new Set(speakers.map(s => s.speaker)).size;

    // Mood
    let mood;
    if (wm && wm.self.inCombat) {
      mood = 'tense';
    } else if (now - this._lastKillAt < 60000) {
      mood = 'post-victory';
    } else if (now - this._lastCombatEndAt < 30000) {
      mood = 'post-combat';
    } else if (uniqueSpeakerCount >= 3) {
      mood = 'social';
    } else if (now - this._lastEventAt > 30000) {
      mood = 'idle';
    } else {
      mood = 'casual';
    }

    // Recency
    const turnsSince = this._recentSpeakers.filter(s => s.speaker !== this.characterName).length;
    let recency;
    if (this._lastSpokeAt === 0) {
      recency = "Haven't spoken yet";
    } else if (turnsSince === 0) {
      recency = 'Just spoke';
    } else {
      recency = `${turnsSince} conversation turn${turnsSince > 1 ? 's' : ''} since you last spoke`;
    }

    // Obligations
    const obligations = this._pendingObligations.map(o => ({
      speaker: o.speaker,
      content: o.content ? o.content.substring(0, 60) : '',
      score: o.score,
    }));

    // Density
    let density;
    if (uniqueSpeakerCount === 0) density = 'silent';
    else if (uniqueSpeakerCount === 1) density = 'one-on-one';
    else if (uniqueSpeakerCount <= 3) density = `moderate (${uniqueSpeakerCount} speakers)`;
    else density = `busy (${uniqueSpeakerCount} speakers)`;

    // Talk ratio
    const total = this._recentSpeakers.length;
    const ours = this._recentSpeakers.filter(s => s.speaker === this.characterName).length;
    const talkRatio = total > 0 ? ours / total : 0;

    return { setting, activity, mood, recency, obligations, density, talkRatio };
  }

  // --- Layer 4: Turn Management ---

  canSpeak() {
    // Double-tap prevention
    if (this._lastSpeakerWasUs) return false;

    // Talk ratio check
    const total = this._recentSpeakers.length;
    if (total < 2) return true; // not enough data

    const ours = this._recentSpeakers.filter(s => s.speaker === this.characterName).length;
    const distinctSpeakers = new Set(this._recentSpeakers.map(s => s.speaker)).size;
    const targetRatio = distinctSpeakers > 0 ? 1 / distinctSpeakers : 0.5;
    const currentRatio = total > 0 ? ours / total : 0;

    if (currentRatio > targetRatio * 1.5) return false; // too chatty

    return true;
  }

  recordSpeech(message) {
    this._lastSpokeAt = Date.now();
    this._lastSpeakerWasUs = true;
    this._addToWindow(this.characterName);
    // Clear pending obligations (we responded)
    this._pendingObligations = [];
  }

  getResponseDelay(messageLength = 20) {
    // Base delay: 1500-2500ms depending on message length
    const base = 1500 + Math.min(messageLength * 30, 1000);
    // Jitter: ±30%
    const jitter = Math.floor(Math.random() * base * 0.3);
    const sign = Math.random() > 0.5 ? 1 : -1;
    return Math.max(1000, base + sign * jitter);
  }

  // --- Layer 5: Prompt Assembly ---

  assemblePrompt() {
    // Only assemble if there are HIGH obligations and we can speak
    const highObligations = this._pendingObligations.filter(o => o.score >= OBLIGATION_THRESHOLD);
    if (highObligations.length === 0) return null;
    if (!this.canSpeak()) return null;

    const frame = this.getSocialFrame();
    const trigger = highObligations[0]; // highest-priority obligation

    // Determine constraint from activity state
    let constraint;
    if (this.worldModel && this.worldModel.self.inCombat) {
      constraint = 'combat'; // terse, action-focused
    } else if (trigger.tag === TAGS.CHANNEL_CHATTER) {
      constraint = 'channel'; // brief, topical
    } else {
      constraint = 'social'; // relaxed, natural
    }

    return {
      frame,
      trigger: {
        speaker: trigger.speaker,
        content: trigger.content,
        tag: trigger.tag,
        score: trigger.score,
      },
      contextBuffer: this._contextBuffer.slice(-5).map(c => ({
        speaker: c.speaker,
        content: c.content ? c.content.substring(0, 80) : '',
        tag: c.tag,
      })),
      constraint,
    };
  }

  // --- Pipeline ---

  processText(text) {
    if (!text) return;

    // Split into lines and classify each
    const lines = text.split('\n');
    for (const line of lines) {
      const classified = this.classifyLine(line);

      if (classified.tag === TAGS.NON_SOCIAL) continue;

      // Track speaker in window
      if (classified.speaker) {
        this._addToWindow(classified.speaker);
        this._lastSpeakerWasUs = (classified.speaker.toLowerCase() === this.characterName);
      }

      // Score obligation
      const { score, reasons } = this.scoreObligation(classified);

      if (score >= OBLIGATION_THRESHOLD) {
        // HIGH obligation — queue for response
        const obligation = {
          speaker: classified.speaker,
          content: classified.content,
          tag: classified.tag,
          channel: classified.channel,
          score,
          reasons,
          at: Date.now(),
        };
        this._pendingObligations.push(obligation);
        if (this._pendingObligations.length > this._maxObligations) {
          this._pendingObligations.shift();
        }
        this.log('OBLIGATION', `HIGH(${score}) from ${classified.speaker}: ${(classified.content || '').substring(0, 50)} [${reasons.join(', ')}]`);
        this.emit('obligation:high', obligation);
      } else if (score > 0) {
        // Non-obligatory social line — add to context buffer
        this._contextBuffer.push(classified);
        if (this._contextBuffer.length > this._maxContext) {
          this._contextBuffer.shift();
        }
      }
    }

    // Update mood tracking from world model events
    if (this.worldModel) {
      const events = this.worldModel.getRecentEvents(3);
      for (const e of events) {
        const at = new Date(e.at).getTime();
        if (e.type === 'kill') this._lastKillAt = Math.max(this._lastKillAt, at);
        if (e.type === 'state_transition' && e.detail.includes('→ idle')) {
          this._lastCombatEndAt = Math.max(this._lastCombatEndAt, at);
        }
        this._lastEventAt = Math.max(this._lastEventAt, at);
      }
    }
  }

  // --- Response Delay Queue ---

  queueResponse(message, channel = 'say') {
    const delay = this.getResponseDelay(message.length);
    this.log('QUEUE', `"${message.substring(0, 40)}..." via ${channel} (${delay}ms delay)`);

    setTimeout(() => {
      this.recordSpeech(message);
      this.emit('speak', { message, channel, command: `${channel} ${message}` });
    }, delay);
  }

  // --- Snapshot ---

  snapshot() {
    return {
      pendingObligations: this._pendingObligations.length,
      highestObligation: this._pendingObligations.length > 0
        ? Math.max(...this._pendingObligations.map(o => o.score))
        : 0,
      canSpeak: this.canSpeak(),
      talkRatio: this._recentSpeakers.length > 0
        ? this._recentSpeakers.filter(s => s.speaker === this.characterName).length / this._recentSpeakers.length
        : 0,
      recentSpeakers: [...new Set(this._recentSpeakers.map(s => s.speaker))],
      lastSpokeAt: this._lastSpokeAt || null,
      hasPrompt: this.assemblePrompt() !== null,
    };
  }

  // --- Internal ---

  _addToWindow(speaker) {
    this._recentSpeakers.push({ speaker: speaker.toLowerCase(), at: Date.now() });
    if (this._recentSpeakers.length > this._windowSize) {
      this._recentSpeakers.shift();
    }
  }

  _compileSocialConfig() {
    if (!this.serverProfile || !this.serverProfile._raw || !this.serverProfile._raw.social) return;

    const social = this.serverProfile._raw.social;

    // Compile patterns
    if (social.patterns) {
      for (const [name, pattern] of Object.entries(social.patterns)) {
        try {
          this._patterns[name] = new RegExp(pattern, 'i');
        } catch { /* skip invalid regex */ }
      }
    }

    // Store channel configs
    if (social.channels) {
      this._channelConfigs = social.channels;
    }
  }
}

module.exports = { ConversationMiddleware, TAGS, OBLIGATION_THRESHOLD };
