#!/usr/bin/env python3
"""
Vision server: captures Qud screen and outputs vision-state.json.

Runs as a persistent process, writing structured game state to
vision-state.json on every game turn change (or at a fixed interval).

Output format matches the C# mod's state.json as closely as possible
so the Node.js agent can use either source interchangeably.

Usage:
    python server.py [--interval 1.0] [--once]
"""

import argparse
import json
import time
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import mss
from PIL import Image

from capture import find_qud_window
from ocrmac.ocrmac import OCR
from tiles import load_library as load_tile_library

CAL_PATH = Path(__file__).parent / "calibration.json"
OUTPUT_DIR = Path.home() / "mud-daemon-gamestate" / "mud-daemon" / "data" / "qud" / "ipc"


def load_calibration():
    with open(CAL_PATH) as f:
        return json.load(f)


def extract_cell(frame, cal, col, row, scroll_col=0):
    """Extract a single tile cell from the frame.
    scroll_col: horizontal viewport scroll offset (game column at pixel x=0).
    Handles float tile heights via rounding."""
    tw = int(cal["tile_width"])
    th = cal["tile_height"]  # may be float
    oy = cal["grid_offset_y"]  # may be float
    # Horizontal: account for viewport scroll
    x = int(round((col - scroll_col) * tw))
    # Vertical: no scroll, compute from float offsets
    y = int(round(oy + row * th))
    th_px = int(round(oy + (row + 1) * th)) - y  # exact pixel height for this row
    h, w = frame.shape[:2]
    if x + tw > w or y + th_px > h or x < 0 or y < 0:
        return None
    return frame[y:y + th_px, x:x + tw]


def compute_scroll_col(cal, player_x=None):
    """Compute the horizontal scroll offset from player position."""
    tw = int(cal["tile_width"])
    viewport_w = cal.get("viewport_width", 1080)
    cols_visible = viewport_w / tw
    if player_x is not None:
        scroll_col = player_x - cols_visible / 2
        scroll_col = max(0, min(scroll_col, cal["grid_cols"] - cols_visible))
        return scroll_col
    return 0


def find_player(frame, cal, scroll_col=0):
    """Find the player character — bright cell with high contrast and white-ish color."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    best_pos = None
    best_score = 0

    tw = int(cal["tile_width"])
    viewport_w = cal.get("viewport_width", 1080)
    max_screen_col = int(viewport_w / tw)

    for row in range(0, cal["grid_rows"]):
        for screen_col in range(0, max_screen_col):
            game_col = int(scroll_col + screen_col)
            if game_col < 0 or game_col >= cal["grid_cols"]:
                continue

            cell_gray = extract_cell(gray, cal, game_col, row, scroll_col)
            cell_bgr = extract_cell(frame, cal, game_col, row, scroll_col)
            if cell_gray is None or cell_bgr is None:
                continue

            max_b = int(np.max(cell_gray))
            mean_b = float(np.mean(cell_gray))
            contrast = max_b - mean_b

            if max_b < 180 or contrast < 20:
                continue

            bright_mask = cell_gray > max(100, max_b * 0.7)
            if not np.any(bright_mask):
                continue
            bright_rgb = cell_bgr[bright_mask].mean(axis=0)
            color_spread = float(np.std(bright_rgb[:3]))

            if color_spread > 25:
                continue
            score = max_b + contrast * 2 - color_spread * 5
            if score > best_score:
                best_score = score
                best_pos = (game_col, row)

    if best_pos:
        cell = extract_cell(gray, cal, best_pos[0], best_pos[1], scroll_col)
        return best_pos, int(np.max(cell))
    return None, 0


def find_player_template(frame, cal, library, scroll_col=0):
    """Find player by matching @player template across the visible grid."""
    from tiles import match_cell
    best_pos = None
    best_score = 0

    player_lib = {"@player": library.get("@player", [])}
    if not player_lib["@player"]:
        return None, 0

    tw = int(cal["tile_width"])
    viewport_w = cal.get("viewport_width", 1080)
    max_screen_col = int(viewport_w / tw)

    for row in range(0, cal["grid_rows"]):
        for screen_col in range(0, max_screen_col):
            game_col = int(scroll_col + screen_col)
            if game_col < 0 or game_col >= cal["grid_cols"]:
                continue

            cell = extract_cell(frame, cal, game_col, row, scroll_col)
            if cell is None:
                continue
            gcell = cv2.cvtColor(cell[:, :, :3], cv2.COLOR_BGR2GRAY)
            if int(np.max(gcell)) < 40:
                continue

            match, score = match_cell(cell, player_lib, threshold=0.85)
            if match and score > best_score:
                best_score = score
                best_pos = (game_col, row)

    return best_pos, best_score


def detect_entities_nearby(frame, cal, library, player_pos, scroll_col=0, radius=20):
    """Detect entities near the player using template matching."""
    from tiles import match_cell
    if not library or not player_pos:
        return []

    px, py = player_pos
    entities = []

    tw = int(cal["tile_width"])
    viewport_w = cal.get("viewport_width", 1080)
    max_screen_col = int(viewport_w / tw)
    min_visible = int(scroll_col)
    max_visible = int(scroll_col + max_screen_col)

    for row in range(max(0, py - radius), min(cal["grid_rows"], py + radius + 1)):
        for col in range(max(min_visible, px - radius), min(max_visible, px + radius + 1)):
            if col < 0 or col >= cal["grid_cols"]:
                continue
            if (col, row) == player_pos:
                continue

            cell = extract_cell(frame, cal, col, row, scroll_col)
            if cell is None:
                continue
            gcell = cv2.cvtColor(cell[:, :, :3], cv2.COLOR_BGR2GRAY)
            if int(np.max(gcell)) < 30:
                continue

            entity_lib = {k: v for k, v in library.items() if k != "@player"}
            match, score = match_cell(cell, entity_lib, threshold=0.70)
            if match:
                entities.append({
                    "x": col,
                    "y": row,
                    "name": match["name"],
                    "hostile": match.get("hostile", False),
                    "confidence": float(score),
                    "category": match.get("category", "unknown"),
                    "hp": 0,
                    "maxHp": 0,
                })

    entities.sort(key=lambda e: e["confidence"], reverse=True)
    return entities


def ocr_sidebar(frame, cal):
    """OCR the sidebar for messages and game info."""
    sidebar_x = cal["sidebar_start_x"]
    sidebar = frame[:, sidebar_x:]

    if sidebar.shape[1] < 10:
        return []

    # Save temp file for ocrmac
    tmp_path = "/tmp/qud_vision_sidebar.png"
    pil_img = Image.fromarray(cv2.cvtColor(sidebar, cv2.COLOR_BGR2RGB))
    pil_img.save(tmp_path)

    try:
        ocr = OCR(tmp_path)
        results = ocr.recognize()
        texts = [r[0].strip() for r in results if r[0].strip()]
        return texts
    except Exception:
        return []


def build_vision_state(frame, cal, tile_library=None, ground_truth_state=None):
    """Build a state dict from the frame, matching state.json format.
    If ground_truth_state is provided, uses player position for scroll calculation."""
    t0 = time.time()

    # Compute scroll offset from ground truth if available
    scroll_col = 0
    if ground_truth_state:
        player_x = ground_truth_state["position"]["x"]
        scroll_col = compute_scroll_col(cal, player_x)

    # Step 1: Find player position
    player_pos = None
    player_brightness = 0

    if ground_truth_state:
        # Hybrid mode: use ground truth for reliable player position
        player_pos = (ground_truth_state["position"]["x"], ground_truth_state["position"]["y"])
        cell = extract_cell(frame, cal, player_pos[0], player_pos[1], scroll_col)
        if cell is not None:
            player_brightness = int(np.max(cv2.cvtColor(cell[:, :, :3], cv2.COLOR_BGR2GRAY)))
    else:
        # Vision-only: find player via template matching
        player_pos, player_score = find_player_template(frame, cal, tile_library, scroll_col)
        player_brightness = int(player_score * 255) if player_pos else 0
        if not player_pos:
            player_pos, player_brightness = find_player(frame, cal, scroll_col)

    # Step 2: Detect entities near the player
    entities = detect_entities_nearby(frame, cal, tile_library, player_pos, scroll_col)

    # OCR sidebar for messages
    sidebar_texts = ocr_sidebar(frame, cal)

    elapsed_ms = (time.time() - t0) * 1000

    state = {
        "name": "vision-agent",
        "hp": 0,  # TODO: OCR from sidebar
        "maxHp": 0,
        "level": 0,
        "xp": 0,
        "position": {"x": player_pos[0], "y": player_pos[1]} if player_pos else {"x": 0, "y": 0},
        "zoneName": "unknown",  # TODO: OCR from sidebar header
        "zone": "unknown",
        "entities": entities,
        "messages": sidebar_texts,
        "inventory": [],
        "equipment": {},
        "effects": [],
        "quests": [],
        "_vision": {
            "player_brightness": player_brightness,
            "entity_candidates": len(entities),
            "sidebar_texts": len(sidebar_texts),
            "processing_ms": round(elapsed_ms, 1),
            "scroll_col": round(scroll_col, 1),
        },
    }

    return state


def main():
    parser = argparse.ArgumentParser(description="Qud vision server")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between captures")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--output", type=str, default=str(OUTPUT_DIR / "vision-state.json"))
    parser.add_argument("--use-ground-truth", action="store_true",
                        help="Use state.json for scroll calculation (hybrid mode)")
    args = parser.parse_args()

    cal = load_calibration()
    output_path = Path(args.output)

    # Load tile library
    tile_library = load_tile_library()
    tile_count = sum(len(v) for v in tile_library.values())
    print(f"[VISION] Tile library: {len(tile_library)} types, {tile_count} variants")
    print(f"[VISION] Calibration: {cal['tile_width']}x{cal['tile_height']:.1f}px tiles, "
          f"y_offset={cal['grid_offset_y']:.1f}")

    # Find window
    window = find_qud_window()
    if not window:
        print("[VISION] Qud window not found")
        sys.exit(1)
    print(f"[VISION] Window: {window['width']}x{window['height']}")

    print(f"[VISION] Writing to {output_path}")
    if args.use_ground_truth:
        print(f"[VISION] Using state.json for scroll calculation (hybrid mode)")
    if not args.once:
        print(f"[VISION] Interval: {args.interval}s — Ctrl+C to stop")

    iteration = 0
    with mss.mss() as sct:
        while True:
            raw = sct.grab(window)
            frame_bgr = np.array(raw)[:, :, :3]

            # Optionally read ground truth for scroll calculation
            gt_state = None
            if args.use_ground_truth:
                gt_path = OUTPUT_DIR / "state.json"
                try:
                    with open(gt_path) as f:
                        gt_state = json.load(f)
                except (FileNotFoundError, json.JSONDecodeError):
                    pass

            state = build_vision_state(frame_bgr, cal, tile_library, gt_state)

            class NpEncoder(json.JSONEncoder):
                def default(self, obj):
                    if isinstance(obj, (np.integer,)):
                        return int(obj)
                    if isinstance(obj, (np.floating,)):
                        return float(obj)
                    if isinstance(obj, np.ndarray):
                        return obj.tolist()
                    return obj

            with open(output_path, "w") as f:
                json.dump(state, f, indent=2, cls=NpEncoder)

            v = state["_vision"]
            pos = state["position"]
            scroll = v.get("scroll_col", 0)
            print(f"[{iteration:4d}] player=({pos['x']},{pos['y']}) "
                  f"entities={v['entity_candidates']} "
                  f"msgs={v['sidebar_texts']} "
                  f"scroll={scroll:.0f} "
                  f"{v['processing_ms']:.0f}ms")

            iteration += 1

            if args.once:
                break

            time.sleep(args.interval)


if __name__ == "__main__":
    main()
