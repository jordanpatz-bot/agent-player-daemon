#!/usr/bin/env python3
"""
Tile template library builder and matcher.

Extracts tile images from frames at known entity positions (ground truth),
builds a template library indexed by entity name, and provides fast
template matching for entity identification.

Usage:
    python tiles.py build          # extract tiles from live game
    python tiles.py build --count 20  # extract over 20 turns
    python tiles.py match frame.png   # match tiles in a frame
    python tiles.py show              # display the tile library
"""

import argparse
import json
import time
import subprocess
import sys
from pathlib import Path
from collections import defaultdict

import cv2
import numpy as np
from PIL import Image

try:
    import mss
    from capture import find_qud_window, read_state
    HAS_CAPTURE = True
except ImportError:
    HAS_CAPTURE = False

IPC_DIR = Path.home() / "mud-daemon-gamestate" / "mud-daemon" / "data" / "qud" / "ipc"
CAL_PATH = Path(__file__).parent / "calibration.json"
TILES_DIR = Path(__file__).parent / "tile_library"


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
    x = int(round((col - scroll_col) * tw))
    y = int(round(oy + row * th))
    th_px = int(round(oy + (row + 1) * th)) - y
    h, w = frame.shape[:2]
    if x + tw > w or y + th_px > h or x < 0 or y < 0:
        return None
    return frame[y:y + th_px, x:x + tw]


def tile_signature(cell):
    """Create a compact signature for a tile cell for deduplication."""
    if cell is None or cell.size == 0:
        return None
    # Resize to 8x8 and compute hash
    small = cv2.resize(cell, (8, 8))
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    mean = np.mean(gray)
    return tuple((gray > mean).flatten().astype(int))


def compute_scroll_col(state, cal):
    """Compute the horizontal scroll offset from player position.
    The viewport centers on the player. scroll_col is the game column at pixel x=0."""
    tw = int(cal["tile_width"])
    viewport_w = cal.get("viewport_width", 1080)
    cols_visible = viewport_w / tw
    player_x = state["position"]["x"]
    # Player is roughly centered in the viewport
    scroll_col = player_x - cols_visible / 2
    # Clamp to zone bounds
    scroll_col = max(0, min(scroll_col, cal["grid_cols"] - cols_visible))
    return scroll_col


def extract_tiles_from_frame(frame, state, cal):
    """Extract entity tiles from a frame using ground truth positions."""
    tiles = []
    scroll_col = compute_scroll_col(state, cal)

    # Player tile
    px, py = state["position"]["x"], state["position"]["y"]
    player_cell = extract_cell(frame, cal, px, py, scroll_col)
    if player_cell is not None:
        tiles.append({
            "name": "@player",
            "x": px, "y": py,
            "cell": player_cell.copy(),
            "hostile": False,
            "category": "player",
        })

    # Entity tiles
    for e in state.get("entities", []):
        cell = extract_cell(frame, cal, e["x"], e["y"], scroll_col)
        if cell is None:
            continue
        gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
        if np.max(gray) < 20:
            continue  # too dark to see

        tiles.append({
            "name": e["name"],
            "x": e["x"], "y": e["y"],
            "cell": cell.copy(),
            "hostile": e.get("hostile", False),
            "category": "hostile" if e.get("hostile", False) else "npc",
        })

    return tiles


def build_library(count=1):
    """Build tile library from live game captures."""
    cal = load_calibration()
    TILES_DIR.mkdir(parents=True, exist_ok=True)

    window = find_qud_window()
    if not window:
        print("Qud window not found")
        return

    # Load existing library
    library = load_library()

    subprocess.run(["osascript", "-e", 'tell application "CavesOfQud" to activate'],
                   capture_output=True)
    time.sleep(0.5)

    collected = 0
    prev_turn = None

    with mss.mss() as sct:
        for i in range(count * 20):  # poll up to 20 times per desired turn
            state = read_state(IPC_DIR)
            if not state:
                time.sleep(0.5)
                continue

            turn = state.get("turn")
            if turn == prev_turn:
                time.sleep(0.3)
                continue
            prev_turn = turn

            raw = sct.grab(window)
            frame = np.array(raw)[:, :, :3]  # BGRA → BGR

            tiles = extract_tiles_from_frame(frame, state, cal)

            for t in tiles:
                name = t["name"]
                sig = tile_signature(t["cell"])
                if sig is None:
                    continue

                # Check if we already have this signature
                if name in library:
                    existing_sigs = [tile_signature(s["cell"]) for s in library[name]]
                    if sig in existing_sigs:
                        continue  # already have this tile variant

                if name not in library:
                    library[name] = []
                library[name].append({
                    "cell": t["cell"],
                    "hostile": t["hostile"],
                    "category": t["category"],
                })

                # Save tile image
                safe_name = name.replace(" ", "_").replace("/", "_").replace("[", "").replace("]", "")[:40]
                idx = len(library[name]) - 1
                tile_path = TILES_DIR / f"{safe_name}_{idx}.png"
                cv2.imwrite(str(tile_path), t["cell"])

            collected += 1
            names = [t["name"] for t in tiles]
            print(f"[{collected}/{count}] T{turn}: {len(tiles)} tiles — "
                  f"{', '.join(set(names))}")

            if collected >= count:
                break

            time.sleep(0.5)

    # Save library index
    save_library_index(library)
    total_tiles = sum(len(v) for v in library.values())
    print(f"\nLibrary: {len(library)} entity types, {total_tiles} total tile variants")
    return library


def save_library_index(library):
    """Save library metadata (without pixel data)."""
    index = {}
    for name, variants in library.items():
        index[name] = {
            "count": len(variants),
            "hostile": variants[0]["hostile"] if variants else False,
            "category": variants[0]["category"] if variants else "unknown",
        }
    with open(TILES_DIR / "index.json", "w") as f:
        json.dump(index, f, indent=2)


def load_library():
    """Load tile library from disk."""
    library = defaultdict(list)
    if not TILES_DIR.exists():
        return library

    index_path = TILES_DIR / "index.json"
    if not index_path.exists():
        return library

    with open(index_path) as f:
        index = json.load(f)

    for name, info in index.items():
        safe_name = name.replace(" ", "_").replace("/", "_").replace("[", "").replace("]", "")[:40]
        for i in range(info["count"]):
            tile_path = TILES_DIR / f"{safe_name}_{i}.png"
            if tile_path.exists():
                cell = cv2.imread(str(tile_path))
                if cell is not None:
                    library[name].append({
                        "cell": cell,
                        "hostile": info["hostile"],
                        "category": info["category"],
                    })

    return library


def normalize_brightness(gray):
    """Normalize a grayscale image to full 0-255 range."""
    mn, mx = int(np.min(gray)), int(np.max(gray))
    if mx - mn < 5:
        return gray
    return ((gray.astype(np.float32) - mn) / (mx - mn) * 255).astype(np.uint8)


def _extract_sprite_mask(gray, min_sprite_pixels=5):
    """Extract the sprite foreground mask using adaptive thresholding.
    Returns (mask, is_entity_like) where is_entity_like indicates the cell
    likely contains an entity sprite vs just terrain texture."""
    cell_max = int(np.max(gray))
    cell_median = float(np.median(gray))

    # Sprite pixels are significantly brighter than the cell's background
    sprite_thresh = max(cell_median + 20, 38)
    mask = gray > sprite_thresh

    sprite_count = int(np.sum(mask))
    total_pixels = gray.shape[0] * gray.shape[1]

    # Entity-like: sprite occupies 1-45% of tile area, has contrast above background
    sprite_ratio = sprite_count / max(total_pixels, 1)
    contrast = cell_max - cell_median
    is_entity_like = (min_sprite_pixels <= sprite_count and
                      0.01 < sprite_ratio < 0.45 and
                      contrast > 15)

    return mask, is_entity_like


def match_cell(cell, library, threshold=0.7):
    """Match a cell against the tile library.
    Uses adaptive sprite extraction + color/shape/pixel comparison."""
    if cell is None or cell.size == 0:
        return None, 0

    cell_bgr = cell[:, :, :3].astype(np.float32)
    gray_cell = cv2.cvtColor(cell[:, :, :3], cv2.COLOR_BGR2GRAY)

    cell_max = int(np.max(gray_cell))
    if cell_max < 40:
        return None, 0

    cell_sprite_mask, cell_is_entity = _extract_sprite_mask(gray_cell)
    if not cell_is_entity:
        return None, 0

    cell_sprite_colors = cell_bgr[cell_sprite_mask]
    if len(cell_sprite_colors) < 5:
        return None, 0
    cell_mean_color = cell_sprite_colors.mean(axis=0)

    best_match = None
    best_score = 0

    for name, variants in library.items():
        for variant in variants:
            tmpl_raw = variant["cell"][:, :, :3]
            template_bgr = tmpl_raw.astype(np.float32)

            if template_bgr.shape[:2] != cell_bgr.shape[:2]:
                template_bgr = cv2.resize(template_bgr,
                    (cell_bgr.shape[1], cell_bgr.shape[0])).astype(np.float32)
                gray_tmpl = cv2.cvtColor(
                    cv2.resize(tmpl_raw, (cell_bgr.shape[1], cell_bgr.shape[0])),
                    cv2.COLOR_BGR2GRAY)
            else:
                gray_tmpl = cv2.cvtColor(tmpl_raw, cv2.COLOR_BGR2GRAY)

            tmpl_sprite_mask, _ = _extract_sprite_mask(gray_tmpl)
            tmpl_sprite_colors = template_bgr[tmpl_sprite_mask]
            if len(tmpl_sprite_colors) < 5:
                continue
            tmpl_mean_color = tmpl_sprite_colors.mean(axis=0)

            for tmpl, tmpl_mask, tmpl_mc in [
                (template_bgr, tmpl_sprite_mask, tmpl_mean_color),
                (cv2.flip(template_bgr, 1), np.flip(tmpl_sprite_mask, axis=1), tmpl_mean_color),
            ]:
                # Color similarity (sprite foreground colors)
                color_dist = float(np.sqrt(np.sum((cell_mean_color - tmpl_mc) ** 2)))
                color_score = np.exp(-color_dist / 60.0)

                # Shape overlap (IoU of sprite masks)
                intersection = int(np.sum(cell_sprite_mask & tmpl_mask))
                union = int(np.sum(cell_sprite_mask | tmpl_mask))
                shape_score = intersection / max(union, 1)

                # Pixel-level comparison on sprite region only
                sprite_mask = cell_sprite_mask | tmpl_mask
                fg_count = int(np.sum(sprite_mask))
                if fg_count < 5:
                    continue
                diff = cell_bgr[sprite_mask] - tmpl[sprite_mask]
                mse = float(np.mean(diff ** 2))
                pixel_score = np.exp(-mse / 1500.0)

                score = color_score * 0.4 + shape_score * 0.35 + pixel_score * 0.25

                if score > best_score and score > threshold:
                    best_score = score
                    best_match = {
                        "name": name,
                        "hostile": variant["hostile"],
                        "category": variant["category"],
                        "confidence": score,
                    }

    return best_match, best_score


def match_frame(frame_path):
    """Match all cells in a frame against the library."""
    cal = load_calibration()
    library = load_library()

    if not library:
        print("No tile library — run 'python tiles.py build' first")
        return

    frame = cv2.imread(frame_path)
    if frame is None:
        print(f"Could not load {frame_path}")
        return

    print(f"Library: {len(library)} types, "
          f"{sum(len(v) for v in library.values())} variants")
    print(f"Matching against {cal['grid_cols']}x{cal['grid_rows']} grid...\n")

    matches = []
    for row in range(cal["grid_rows"]):
        for col in range(cal["grid_cols"]):
            cell = extract_cell(frame, cal, col, row)
            if cell is None:
                continue

            gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
            if np.max(gray) < 20:
                continue

            match, score = match_cell(cell, library)
            if match:
                matches.append({**match, "x": col, "y": row})

    print(f"Found {len(matches)} matches:")
    for m in sorted(matches, key=lambda m: m["confidence"], reverse=True):
        print(f"  ({m['x']:2d},{m['y']:2d}) {m['name']:30s} "
              f"conf={m['confidence']:.3f} {m['category']}")


def show_library():
    """Display the tile library contents."""
    library = load_library()
    if not library:
        print("No tile library — run 'python tiles.py build' first")
        return

    print(f"Tile Library: {len(library)} entity types\n")
    for name in sorted(library.keys()):
        variants = library[name]
        info = variants[0] if variants else {}
        print(f"  {name:35s} variants={len(variants):2d} "
              f"category={info.get('category','?'):8s} "
              f"hostile={info.get('hostile', False)}")


def main():
    parser = argparse.ArgumentParser(description="Tile template library")
    parser.add_argument("command", choices=["build", "match", "show"],
                        help="build=extract tiles, match=identify tiles, show=list library")
    parser.add_argument("arg", nargs="?", help="frame path for match command")
    parser.add_argument("--count", type=int, default=1, help="turns to capture for build")
    args = parser.parse_args()

    if args.command == "build":
        build_library(count=args.count)
    elif args.command == "match":
        if not args.arg:
            print("Usage: python tiles.py match <frame.png>")
            return
        match_frame(args.arg)
    elif args.command == "show":
        show_library()


if __name__ == "__main__":
    main()
