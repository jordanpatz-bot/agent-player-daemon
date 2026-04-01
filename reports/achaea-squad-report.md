# Achaea Squad Grind Report

**Session Date:** 2026-03-31 ~03:00-03:13 UTC
**Objective:** Grind pygmy guards in Miba Village toward Level 10 for all three characters

---

## Character Status

| Character | Class | Level Before | Level After | XP Gained | Guards Killed | HP/Mana |
|-----------|-------|-------------|-------------|-----------|---------------|---------|
| Avicennus | Monk | 7 (74%) | **8 (15%)** | ~10,400 | 3 guards, 1 hunter | 700/700, 600/700 |
| Damianus | Serpent | 7 (55%) | 7 (85%) | ~7,200 | 2 guards, 1 hunter | 650/650, 500/650 |
| Theodorus | Magi | 6 (54%) | 6 (54%) | 0 | 0 (failed to finish any) | 600/600, 600/600 |

---

## Key Findings

### Combat Performance
- **Pygmy guards give 3,232-3,535 XP** each -- far more than hunters (136-147 XP). Guards are the only viable grind target.
- **Avicennus (Monk)** is the most efficient fighter. Snap kick deals 245 damage + two hooks at 100 each = 445 damage per round. Guards die in 2-3 rounds. Uses endurance, not mana.
- **Damianus (Serpent)** does massive single-hit damage with garrote (483 damage), but guards have ~1,500-1,800 HP so it takes 3-4 hits. No health vials left -- relies entirely on TOUCH BOAR for regen.
- **Theodorus (Magi)** is severely handicapped. Fire lash does 260 damage but costs ~120 mana per cast. With only 600 max mana, he can cast 4-5 times before running dry. Guards survived all his attacks and nearly killed him multiple times. He fled to the Ring of Portals twice via reflex-flee triggers.

### Healing & Supplies
- **Avicennus**: Oaken vial is EMPTY. No health sips available. Relies on TOUCH BOAR (black boar tattoo regen).
- **Damianus**: Oaken vial is EMPTY. Same situation -- boar regen only. Has 15 gold on hand.
- **Theodorus**: Oaken vial has ~185 sips of health remaining (started at 197, used ~12). Also has a pinewood vial (contents unknown). He is the only one with health elixir.

### Stale Target Bug
After killing a mob, the game engine retains the dead mob's ID as the active target. Subsequent `KILL guard` commands fail with "targeting guard######, but see nothing by that name here!" even after moving rooms. The fix is `SETTARGET NONE` before each new kill, which adds overhead to the grind loop.

### Guard Patrol Patterns
Pygmy guards roam between rooms. Characters often arrive at rooms with no guards present. The village layout:
- Entrance to Miba Village (SE from forest, NW into village)
- Path lined with shrunken heads (E, SE, NW)
- Miba's fire pit (N, SE, W) -- central hub
- Before a large pygmy hut (E, W) -- frequently has guards
- Before a small, bloody altar (NE, W, D) -- Rimba the priest room
- Outside the kobold slave pen (NE, E, SW)

---

## Urgent Issues

1. **Avicennus and Damianus need health vials refilled.** Without sippable healing, they risk death against guards. Options:
   - Find a city shop (WALK TO or PORTAL to Cyrene/Ashtan/etc.)
   - Buy health elixir (need gold -- Avicennus has 0, Damianus has 15)
   - Kill more mobs to earn gold for refills

2. **Theodorus cannot effectively grind guards as Magi at Level 6.** The mana cost per kill is unsustainable. Options:
   - Kill pygmy hunters instead (much weaker, but only 136 XP each)
   - Meditate between every kill to recover mana
   - Ask on newbie channel about Magi combat tips for low-level grinding
   - Consider killing kobolds or other weaker mobs until higher level

3. **AllowTells is still limited.** Tells were enabled but the allowtells list was never populated, so inter-character communication via TELL won't work yet.

4. **Registration warning.** All three characters show "Our records show that you have not yet registered" -- they should REGISTER to prevent daily purges.

---

## Recommended Next Steps

1. **Avicennus**: Continue grinding guards. Use `SETTARGET NONE` between kills. TOUCH BOAR after each fight. At this rate, Level 9 needs ~6 more guard kills, Level 10 needs ~12-14 total.
2. **Damianus**: Same grind pattern. Close to Level 8 (85%). One more guard should level him up.
3. **Theodorus**: Switch to hunting pygmy hunters (one-shot kills) or find a way to sustain mana. Consider WALK TO a city to buy mana elixir. Ask newbie channel for Magi leveling advice.
4. **All three**: REGISTER to save characters. Refill health vials when possible.

---

## Session Stats
- **Total guards killed:** 5 (Avicennus 3, Damianus 2, Theodorus 0)
- **Total hunters killed:** 2 (Avicennus 1, Damianus 1)
- **Total XP earned:** ~17,600
- **Levels gained:** 1 (Avicennus: 7 -> 8)
- **Deaths:** 0
- **Near-deaths:** 3+ (Theodorus dropped to 12 HP, 34 HP, and 74 HP)
