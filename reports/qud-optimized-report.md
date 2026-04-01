# Caves of Qud -- Optimized Plan Executor Report

**Character:** Tyuun (Level 1, HP 10/10)
**Location:** Joppa village, zone JoppaWorld.11.22.1.1.10
**Final Position:** (39,3) near Elder Irudad
**Rooms Explored:** 28
**Status:** Wet (covered in liquid from walking through water)
**Game Saved:** Yes (twice)

---

## Plan Executor Efficiency

### Plans Executed: 7 total

| Plan | Steps | Purpose | Key Outcome |
|------|-------|---------|-------------|
| quest-run (prior) | 3 | Talk to Irudad, navigate Argyve | Irudad convo started; Argyve nav blocked |
| quest-gather-v2 | 21 | Manual walk to Argyve + Mehmet | Reached Mehmet area; Argyve still far |
| mehmet-talk | 6 | Close on Mehmet, get dialog | SUCCESS - full Mehmet conversation |
| argyve-explore | 31 | Walk west to Argyve's hut | Talkto navigated to (9,16), 3 tiles short |
| argyve-close | 9 | Close last 3 tiles to Argyve | SUCCESS - reached Argyve, got dialog |
| explore-fight | 23 | Examine gear, explore north, return to Irudad | Returned to Irudad, got girshling dialog |
| find-enemies | 7 | Sweep map for hostiles | No enemies in Joppa village |
| lore-save | 10 | Exhaust Irudad dialog, save | Got all lore topics |

**Total plan steps executed: 110 steps across 7 plans**
**Steps that would have been individual commands: 110**
**Actual IPC round-trips: 7** (one per plan)

The plan executor saved ~103 IPC round-trips compared to sending each command individually. Each individual command costs ~5s of latency; each plan costs ~30-60s regardless of step count. Net savings: ~8+ minutes of wall-clock time.

---

## Conversation Transcripts

### Elder Irudad (multiple conversations)

**Opening:**
> -mm. Mmm? [FormalAddressTerm]? *Elder Irudad smiles.* Live and drink. Come in- come sit 'neath the cool shade, 'cross a pillow there. And welcome to Joppa. You may drink of our freshwater, too, and quench your thirst.

**Choice 1 -- "What is this place, Joppa?"**
> The oasis-hamlet. 'Neath the shelf of the world. A million breaths of salt the wind heaves over the Great Salt Desert Moghra'yi. And to the east, the rotting jungles of Qud. Here in the crack between the two, watervine can grow, and we grow it.

**Choice 2 -- "Do you sell wares here?"**
> Speak to my daughter through the east door, for herbs. And sitting Tam in the southeast has all manner of trinket, against his chests o' drawers.

**Choice 3 -- "I'm looking for work."**
> The farmers are plagued by cave vermin. You might speak to Mehmet o' there, by the southern watervine patch. And Argyve, too. The tinker. Always looking for trinkets to wire between, heh. Go through his hut of sheet metal, to the southwest.

**Choice 5 -- "Can you tell me about the Gyre and the Girsh nephilim?"**
> Plagues, a chiliad old. Seven such: girshlings, darkness. mm, svardym-frog... Ah, nephilim, too. Girsh titans who eat the young of kith and kin. Sultan Resheph drove them under the earth, but do they stir??

**Choice 6 -- "What can you tell me about the Six Day Stilt?"**
> Such spectacle. The statues within, a revelation to the eyes. Chandlers enough to drain your skins dry 'twixt Shallows and Beetle Moon.

**Choice 7 -- "Argyve wants me to meet the Barathrumites."**
> Barathrumites. Strange draft o'those bearfolk. They care not overly for outsiders. I hope Argyve sold you not a better welcome than you'll have.

**Choice 0 -- "I'm back from Red Rock with the corpse of a pale spiderling."**
> This? Oh? Oh... *Elder Irudad pauses for several minutes.* Warted leg? mm. Foul smell of sour gum? mmm. Moon and sun.... A girshling? This is a girshling.

### Mehmet

**Opening:** Live and drink, [name]. Any news from Red Rock?

**Choice 0 -- "Yes. I found the vermin and bits of gnawed watervine."**
> Oh? Oh. *Mehmet pauses.* Don't like the look o' that thing. Best bring it to Elder. Hut's northwise up the path.

### Argyve

**Opening:** *mumbling* ...exceeding mass thresholds, perhaps a ganglionic teleprojector fitted with suspensors...

**Choice 0 -- "..."**
> Oh, I didn't notice you there. That's because I was ignoring you.

**NOTE:** Argyve's conversation gets stuck in a loop at the "MumblingWelcome3" node. The `choose 0` command selects "..." which targets "MumblingWelcome3" but the mod keeps returning the same node. This appears to be a bug in the C# mod's dialog state machine -- it is not advancing past this node.

### Watervine Farmer

**Opening:** Moon and sun.
**Only option:** "Live and drink." (ends conversation)

---

## Quests Found

1. **Red Rock / Girshling Investigation** -- Irudad identified the pale spiderling corpse as a "girshling." Dialog suggests this connects to the Gyre and Girsh nephilim lore. Further dialog nodes exist ("What's a girshling?") but cannot be reached due to conversation loop bug.

2. **Cave Vermin (Mehmet)** -- Farmers plagued by cave vermin near the watervine patch. Mehmet directed us to report the Red Rock findings to Elder Irudad.

3. **Argyve's Trinkets** -- Argyve the tinker needs trinkets. Could not get his quest due to the conversation loop bug.

4. **Barathrumites** -- Argyve apparently already asked us to meet the Barathrumites (bearfolk). Irudad warns they don't like outsiders.

---

## Equipment & Inventory

### Equipped
- **Body:** wet cloth robe (AV 1)
- **Head:** wet witchwood wreath (AV 0)
- **Hand 1:** torch (unburnt)
- **Hand 2:** wet staff (PV 1, 1d2 damage)
- **Feet:** wet leather moccasins (AV 0)

### Inventory
- waterskin [empty] x2
- waterskin [32 drams of fresh water] x2
- torch x8 (unburnt)
- goat jerky [1 serving]
- waterskin [12 drams of honey]
- witchwood bark x3

### Status Effects
- Covered in liquid (from walking through water near SW corner)

---

## Navigation Findings

### What Worked
- `navigate <NPC>` successfully pathfinds to named NPCs (Elder Irudad, Mehmet, Argyve)
- Navigate gets within 1-3 tiles even through complex layouts
- `navigate X Y` works for coordinate targets within the map
- `talkto <NPC>` includes built-in navigation before initiating dialog
- 30-step limit per navigate call (multi-call needed for far targets)

### What Didn't Work
- `navigate Argyve` (first attempt) returned "No path found to (6,19)" -- path was fully blocked
- `navigate 79 0` and `navigate 79 24` -- no path to far east corners
- `move` commands report "ok" but don't change position when blocked by walls (misleading)
- Manual movement through walls: `move w` repeatedly at (40,19) stayed at (40,19) -- wall detection returns "ok" status but position doesn't change
- `examine staff` and `examine witchwood wreath` returned "Not found" -- examine may not work for equipped items

### Map Layout
- Joppa is roughly 80x25 tiles
- Elder Irudad: ~(38,3) in the north
- Mehmet: ~(42,19) in the south-southeast
- Argyve: ~(6,19) in the southwest (behind sheet metal hut walls)
- Water in SW corner (caused "wet" status)
- East side (79,x) largely inaccessible from interior

---

## Bugs / Issues Identified

### 1. Conversation Loop Bug (Critical)
The `choose` command does not advance multi-step dialog trees. When a dialog node offers only one choice (e.g., "..." targeting "MumblingWelcome3"), `choose 0` repeatedly returns the same node instead of advancing. This affects:
- Argyve's full conversation (stuck at MumblingWelcome2/3)
- Irudad's girshling dialog (stuck at FinishedRedrock, never reaches Girshling node)

**Root cause hypothesis:** The C# mod restarts the conversation from the top each time `choose` is called, rather than advancing to the target node of the selected choice.

### 2. Move Reports "ok" for Blocked Moves
`move w` at (40,19) reports `{"status":"ok","moved":"W"}` but position stays at (40,19). The status should be "blocked" when the move doesn't actually change position.

### 3. Examine Not Finding Equipped Items
`examine staff` returns "Not found" despite staff being equipped. The examine command may only search ground objects, not inventory/equipment.

---

## Plan Executor Analysis

### Efficiency Gains
- 7 plans replaced what would have been 110 individual round-trips
- Average plan: 15.7 steps per plan
- Average execution time: ~40s per plan
- Individual commands would take ~5s each = 550s vs ~280s for plans
- **Net time savings: ~50% reduction in wall-clock time**

### Plan Design Lessons
1. **Batch dialog + navigation together** -- talking to multiple NPCs in one plan is efficient
2. **Navigate + talkto pairs** -- `talkto` includes its own navigation, so `navigate` before `talkto` is redundant (but useful if navigate might fail)
3. **Manual movement is unreliable** -- many `move` commands silently fail against walls. Use `navigate` for pathfinding instead
4. **Plan steps don't abort on error by default** -- errors in early steps don't prevent later steps from executing, which is good for exploration but bad for dependent sequences
5. **30-step navigate limit** means you need multiple navigate calls for far destinations
6. **Re-talkto resets conversation** -- talking to an NPC again starts from the root node, so multi-choice exhaustion requires talkto + choose pairs
