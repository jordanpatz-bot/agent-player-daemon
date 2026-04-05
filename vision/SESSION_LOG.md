# Vision Pipeline Session Log

Detailed record of what was tried, what worked, and what failed during vision integration development. Written for future agents who inherit this codebase.

---

## Session: 2026-04-04/05 — Fullscreen Calibration + Vision Playthrough

### Context
Jordan switched Qud to fullscreen (1728x1117 display) so we'd have a known resolution. Previous calibration was for a 1002x970 windowed mode (tile_width=10, tile_height=34). Everything needed to be recalibrated from scratch.

### Goal
Recalibrate vision for fullscreen, rebuild tile library, improve entity detection, and run a full autonomous playthrough using vision as the perception layer.

---

## Phase 1: Finding Tile Width (SOLVED: 24px)

### What failed:
1. **Brute-force brightness sweep** (calibrate.py's old approach): Tried every combination of tile_width/height/offset and scored by whether entity cells had bright pixels. Got tw=17.75, th=44 — completely wrong. The scoring heuristic (max brightness in cell) catches walls and terrain, not entities.

2. **FFT / autocorrelation on viewport strips**: Tried to find repeating tile patterns via frequency analysis. Too noisy — the game's terrain doesn't have clean periodic patterns at the tile level.

3. **White blob detection for player**: Found 3+ white blobs of similar size. Couldn't determine which was the player. The player character turned out to be GREEN, not white (color depends on character build).

4. **Color blob matching (green for watervine farmers)**: Found 99 green blobs including terrain grass/plants mixed with actual NPCs. Matching by x-position was ambiguous because terrain decorations are everywhere.

### What worked:
**Phase correlation between consecutive frames after player movement.**

Method:
1. Capture frame 1 (player at game_x=37)
2. Send `move e` command via harness IPC
3. Capture frame 2 (player at game_x=38)
4. `cv2.phaseCorrelate(crop1, crop2)` → measures global pixel shift

Result: shift = (-23.9, 0.0) consistently across 5+ frame pairs. **tile_width = 24 pixels.**

Key insight: the viewport scrolls horizontally to follow the player. When the player moves 1 tile east, the entire viewport shifts left by exactly tile_width pixels. Phase correlation measures this shift with sub-pixel precision.

---

## Phase 2: Finding Tile Height (SOLVED: 36.11px)

### What failed:
1. **Vertical player displacement tracking**: Moved the player south and tried to find the pixel displacement. But the viewport doesn't scroll vertically! The player's pixel_y stays constant because all 25 rows always fit on screen. Tracking the "player" via max brightness found WALLS, not the player.

2. **Frame differencing for vertical move**: When the player moved south, the diff showed the old position disappearing (y=490-522) but the new position was invisible because the player landed on a bright background tile. No clean vertical displacement measurable.

3. **Entity position regression**: Tried to match green blobs to known entity game_y positions. Got inverted results (game_y=19 at pixel_y=972, game_y=21 at pixel_y=684). The matching was wrong — terrain decorations, not actual entities.

### What worked:
**Green channel peak analysis across the full frame height.**

Method:
1. Captured a frame in the outskirts zone (sparse terrain with grass patches)
2. Computed `np.max(green_channel[y, 500:900])` for every row y
3. Found green peaks (grass sprites) at regular intervals
4. Peak starts: 107, 142, 178, 214, 250, ..., 650, 685, 721, 757, 792, 828, 864, 900, 936
5. Spacings between peaks: consistently 35-36 pixels (±1)
6. Linear regression on 14 peak positions vs assigned game rows

Result: **tile_height = 36.113 px, y_offset = 70.1 px**, max residual 2.1px.

Key insight: the game renders grass sprites at specific tile rows. In a sparse zone, these form clean periodic peaks in the green channel. The spacing IS the tile height. The small variation (35-36) is due to the non-integer tile height (36.11) causing rounding at pixel boundaries.

Verification: 30 total console rows × 36.13 px/row = 1084 px = exact frame height. The console has 2 status rows + 25 game rows + 3 bottom UI rows = 30 rows.

---

## Phase 3: Viewport Scrolling (SOLVED)

### Key findings:
- **Horizontal**: viewport scrolls 24px per player tile movement (phase correlation confirms)
- **Vertical**: viewport NEVER scrolls. All 25 game rows always visible at fixed pixel positions.
- **Camera data from mod** (`cam_posX`, `cam_posY`) does NOT reflect viewport scroll. The console renderer handles scrolling independently from the Unity camera.
- **scroll_col** = player_x - (viewport_width_px / tile_width) / 2 ≈ player_x - 22.5

### What failed:
Trying to use Unity camera position (`cam_posX=69.79`) to compute tile positions. The camera is essentially static — the console renderer handles all scrolling internally. Camera math led to wrong predictions.

---

## Phase 4: Entity Detection (PARTIALLY SOLVED)

### Tile library:
Built from ground truth (capture frame + state.json with known entity positions, extract cells). 8 entity types, 14 variants at 24×36px. This part works well.

### match_cell() evolution:

**v1 (broken)**: L2 pixel distance on foreground pixels. Bug: score comparison was OUTSIDE the flip loop, only using the flipped template result. Also: fixed brightness threshold (>35) caught too much terrain.

**v2 (too permissive)**: Fixed the loop bug. Used color_score × 0.5 + shape_score × 0.3 + pixel_score × 0.2. Result: 90% accuracy at known positions, but 514 false positives in blind scan. Building floor checkerboard patterns matched entities at conf=1.0.

**v3 (current, balanced)**: Added `_extract_sprite_mask()` with adaptive thresholding (median + 20, min 38). Entity-likeness check: sprite must occupy 1-45% of tile area, contrast > 15 above median, minimum 5 sprite pixels. Result: 70% accuracy at known positions, 0 false positives in blind scan.

### Core problem (unsolved):
At 24×36 pixels, entity sprites are ~10-15px of actual content within the tile. The background (dark ground, building floors, etc.) dominates. When scanning ALL cells in a radius, terrain textures with moderate brightness pass the entity-likeness check and match templates because the color/shape scoring isn't discriminating enough.

### What would help next:
1. **Connected component analysis** — real sprites form a single connected blob, terrain dots are scattered
2. **Larger tile library** — more variants, including hostile creatures, would improve discrimination
3. **Background subtraction** — capture an empty frame (no entities), subtract it to isolate sprites
4. **VLM assist** — send a screenshot to Claude Vision for one-shot entity identification (slow but accurate)

---

## Phase 5: Agent Integration (WORKING)

### Hybrid state merge:
`harness-client.js` reads both `state.json` (mod) and `vision-state.json` (vision server):
- Mod provides: HP, inventory, equipment, quests, skills, effects, messages, stateVersion
- Vision provides: entity positions with confidence, OCR sidebar text
- Merged state annotates mod entities with `_visionDetected` flag

### Vision server:
`server.py --use-ground-truth` reads mod state for player position → computes scroll_col → extracts cells at correct positions. Without ground truth, player detection via template matching is unreliable (false positives from bright terrain tiles).

### Critical operational issue:
**The game must be the macOS foreground app to process commands.** In fullscreen mode, running terminal commands steals focus and the mod's command polling stops. The workaround: start the agent (`nohup node qud-agent.js ... &`), then immediately `osascript` to refocus the game. Don't touch the terminal until the session finishes.

---

## Phase 6: Playthrough Results

### Session stats across 5 runs:
- **11 of 13 game systems exercised**: quests, dialogue (4 NPCs), navigation (A* + zones), combat, inventory/pickup, eat/drink, rest, status, trading (Tam merchant), save, worldnav
- **Not exercised**: equip (gear pre-equipped), activate (True Kin characters have no mutations), level up (characters died before level 2)
- **Best run**: 48 turns, 0 deaths, 2 quests accepted, traded with merchant, navigated to Red Rock
- **Common death cause**: entering zones with 15+ hostiles at level 1 (baboons + snapjaws swarm)

### LLM prompt lessons:
1. The LLM (haiku/sonnet) defaults to `move n/s/e/w` instead of `navigate`. Must STRONGLY instruct: "NEVER plan long sequences of move commands. Use navigate."
2. "MANDATORY VILLAGE PREP" instructions are partially followed — the agent does eventually trade/status/eat but not always before leaving the village.
3. Dialogue choice indices need explicit rules: "If 1 choice, only valid command is 'choose 0'."
4. Inventory items in state summary were showing as `[object Object]` — fixed by mapping `.name` property.

---

## File Reference

| File | Purpose | Key functions |
|------|---------|---------------|
| `calibration.json` | Grid parameters | tw=24, th=36.11, oy=70.1 |
| `server.py` | Vision server | `build_vision_state()`, `compute_scroll_col()` |
| `tiles.py` | Tile library + matching | `match_cell()`, `_extract_sprite_mask()`, `compute_scroll_col()` |
| `capture.py` | Frame capture | `find_qud_window()` (picks largest window) |
| `calibrate.py` | Grid calibration | `calibrate_from_frame()` |
| `compare.py` | Accuracy measurement | `compare()` |
| `grid.py` | Grid analyzer | Needs update for new calibration |
| `tile_library/` | 8 entity types, 14 variants at 24×36px | |

## What to do next
1. **Improve entity detection**: connected component filtering, background subtraction, or VLM-assisted identification
2. **Pure vision player detection**: current template matching has too many false positives from bright terrain
3. **Run game windowed** (not fullscreen) to avoid focus-stealing issues, OR use SSH-based agent runner
4. **Equip/activate/level up**: needs a mutant character (for activate) and longer survival runs (for leveling)
5. **Speed**: processing is 2-3s per frame; target <500ms for real-time play
