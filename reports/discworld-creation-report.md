# Discworld MUD Character Creation Report

Server: `discworld.starturtle.net:4242`
Date: 2026-03-30

---

## Character 1: Olympiodorus (Warrior)

- **Name:** Olympiodorus
- **Password:** h0munculus15
- **Gender:** Male
- **Race:** Human (no race selection on Discworld -- all characters are human)
- **Nationality:** Morporkian (Ankh-Morpork)
- **Guild:** Warriors' Guild -- Weapon Masters' Court
- **Guild Status:** JOINED (confirmed via `score`)
- **Starting Location:** Mended Drum, Ankh-Morpork
- **Guild Location:** Weapon Masters' Court bar/warehouse, Vagabond Street, Ankh-Morpork
- **Last Known Position:** Weapon Masters' Court warehouse (guild room)

### Guild Joining Notes
- Navigated from the Mended Drum south to Filigree Street, west to Cheapside, southwest to Heroes Street, down to Short Street junction, then east on God Street, northeast to Widdershins Broadway, southeast to Upper Broadway, to Esoteric Street, northeast along Esoteric Street to Vagabond Street, east on Vagabond Street to the guild building
- The "join" command is used in the guild warehouse room (not the bar)
- Cedge is the NPC who processes guild membership
- Received "Weapon Masters' Court Guide" on joining

---

## Character 2: Hermeticus (Wizard -- pending guild join)

- **Name:** Hermeticus
- **Password:** h0munculus16
- **Gender:** Male
- **Race:** Human
- **Nationality:** Morporkian (Ankh-Morpork)
- **Guild:** Adventurers' Guild (default -- not yet joined Wizards' Guild)
- **Intended Guild:** Wizards' Guild at Unseen University, Sator Square
- **Starting Location:** Mended Drum, Ankh-Morpork
- **Last Known Position:** King's Way / Scoone Avenue area (north part of Ankh city)

### Guild Joining Notes
- The Wizards' Guild is at Unseen University on Sator Square
- Sator Square is accessed via The Cham, which runs north from the Plaza of Broken Moons
- Navigation from the Mended Drum to Sator Square requires going through the central/eastern part of the city
- Guild join not yet completed -- character needs to navigate to UU and use the `join` command in the guild room

---

## Character 3: Nigredus (Assassin/Thief -- pending guild join)

- **Name:** Nigredus
- **Password:** h0munculus17
- **Gender:** Male
- **Race:** Human
- **Nationality:** Morporkian (Ankh-Morpork)
- **Guild:** Adventurers' Guild (default -- not yet joined a guild)
- **Intended Guild:** Thieves' Guild (2 Alchemists Street) or Assassins' Guild (12 Filigree Street)
- **Starting Location:** Mended Drum, Ankh-Morpork
- **Last Known Position:** Mended Drum bar

### Guild Joining Notes
- Thieves' Guild: Located at 2 Alchemists Street, accessible from Street of Alchemists south of Peasant Parade
- Assassins' Guild: Located at 12 Filigree Street, visible from the east end of Filigree Street near Peasant Parade
- Guild join not yet completed -- character needs to navigate to the chosen guild and use the `join` command

---

## Discworld MUD Creation Flow

1. **Main Menu:** Select "N" for New character
2. **Name:** Enter desired name (must not be a book character or noun)
3. **Name Confirmation:** Confirm the name is correct
4. **Password:** Enter and confirm password
5. **Capitalization:** Choose how name is capitalized
6. **Gender:** Choose male or female
7. **Screen Reader:** Answer yes/no
8. **Terms & Conditions:** Wait 30 seconds, then accept with "yes"
9. **Intro Sequence:** Fall into Pumpkin Town (can type "skip" to bypass)
10. **Pumpkin Town:** Starting tutorial village -- climb through window to skip, or go south for the walkthrough
11. **Travel Agent:** Go west from village square to reach the travel agent
12. **Nationality Choice:** Use `choose <nation> <region>` (e.g., `choose morpork ankh-morpork`)
13. **Enter World:** Type `enter door` to teleport to the real Discworld
14. **Guild Joining:** Navigate to desired guild location in-game, use `join` command in the guild room

### Key Differences from Other MUDs
- No race selection (all characters are human)
- No class/guild selection during character creation -- guild must be joined in-game
- Nationality/region determines starting language and location
- 30-second mandatory wait on terms & conditions
- Tutorial village (Pumpkin Town) is optional but one-way -- cannot return once you leave
- Guild joining is permanent -- you can never change guilds
- The `join` command only works in the specific guild room, not just anywhere in the guild building

### Guild Locations in Ankh-Morpork (from in-game brochure)
| Guild | Location |
|-------|----------|
| Wizards | Unseen University, Sator Square |
| Thieves | 2 Alchemists Street |
| Warriors (Weapon Masters) | 4 Vagabond Street |
| Warriors (Palace Guard) | Palace Gates |
| Priests | 2 Small Gods Street |
| Assassins | 12 Filigree Street |
| Witches | Cottage, end of Dione Street |

### Profiles Added
All three characters have been added to `profiles.json` with server type "discworld".
