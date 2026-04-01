# Sendivog Combat Report - The Gauntlet

**Date:** 2026-03-30 19:55-20:01 UTC
**Character:** Sendivog, Mage (Elementalist) -- started Level 5, ended Level 7
**Role:** Healer (designated), DPS (actual)
**Area:** The Gauntlet (level 5-30)

## Summary

Followed Artephius into The Gauntlet as designated healer. In practice, acted purely as melee DPS since no heal spells were cast. Gained 2 levels (5->7) purely from group kill XP share. Took minimal damage as the tank absorbed most hits.

## Level Progression

- Level 5 -> 6: During Bugbear Bandit fights (group XP share)
- Level 6 -> 7: During Disguised Guard fights (group XP share)
- Final TNL: 344 (to level 8)

## Healing Assessment: FAILED TO HEAL

Sendivog did NOT cast any healing spells during combat. Reasons:
1. No heal commands were sent via IPC during combat
2. Mage class at level 5-7 may not have cure light (need to verify with `allspells`)
3. No heal potions were purchased or given to the tank
4. The "healer" role was not enacted -- Sendivog just auto-attacked in melee

### What Should Have Happened
- Cast `shield` on Artephius before combat (damage reduction)
- Cast `cure light` on Artephius when his HP dropped below 50%
- Given heal potions to Artephius
- Used `magic missile` for ranged DPS instead of melee stab

## DPS Contribution

Sendivog auto-attacked with melee stab:
- Damage per hit: 23-24 (stab)
- Contributed to kills alongside Artephius
- No magic missile casts during combat (would have done more damage from safety)

## Mana Management

- Started: 246/246 mana
- Ended: 281/291 mana (gained mana from leveling)
- **Mana was never spent** -- all 291 mana was unused!
- Could have cast ~15-18 magic missiles during the session

## Survivability

- HP barely dropped -- Artephius tanked correctly
- Took occasional stray hits from Bugbear Bandits (slash misses/scratches)
- Never triggered any reflexes (HP stayed above 90%)
- No deaths, no close calls

## Group Coordination

- Followed Artephius correctly
- Auto-attacked mobs in combat (melee)
- No gtell communication during combat
- No healing or support spells cast
- Gained XP purely from proximity to kills

## Spell Assessment

| Spell | Level | Used? | Should Have? |
|-------|-------|-------|-------------|
| Magic Missile | Expert | No | Yes -- primary ranged DPS |
| Shield | 63% | No | Yes -- on tank before combat |
| Chill Touch | Available | No | Yes -- secondary DPS |
| Cure Light | Unknown | No | Yes -- if available, on tank |
| Blink | 50% | N/A | Passive avoidance |

## Recommendations

1. **Check `allspells`** to see if cure light or any heal spells are available
2. **Practice Chill Touch** at trainer (14 practices available)
3. **Cast Shield on Artephius** before every combat
4. **Use Magic Missile** instead of melee -- higher damage, safer distance
5. **Buy heal potions** to give to the tank
6. **Set up a macro or reflex** to auto-cast heal when tank HP drops
7. **The healer role requires active agent control** -- auto-attack isn't enough

## Final Stats

| Metric | Start | End |
|--------|-------|-----|
| Level | 5 | 7 |
| HP | 215/215 | 240/247 |
| Mana | 246/246 | 281/291 (unused!) |
| Kills (group) | 0 | 12 |
| Spells Cast | 0 | 0 |
| Healing Done | 0 | 0 |
