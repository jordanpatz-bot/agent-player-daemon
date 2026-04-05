#!/usr/bin/env python3
"""
Phase 1 validation: compare vision-detected entities against ground truth.

Captures a frame, runs the grid analyzer, and compares detected entities
to the mod's state.json. Reports accuracy metrics.

Usage:
    python compare.py              # live comparison
    python compare.py frame.png state.json  # offline comparison
"""

import argparse
import json
import sys
import time
import subprocess
from pathlib import Path

import cv2
import numpy as np

try:
    import mss
    from capture import find_qud_window, read_state
    HAS_CAPTURE = True
except ImportError:
    HAS_CAPTURE = False

IPC_DIR = Path.home() / "mud-daemon-gamestate" / "mud-daemon" / "data" / "qud" / "ipc"
CAL_PATH = Path(__file__).parent / "calibration.json"


def load_calibration():
    with open(CAL_PATH) as f:
        return json.load(f)


def extract_cell(frame, cal, col, row):
    """Extract a single tile cell from the frame."""
    tw = cal["tile_width"]
    th = cal["tile_height"]
    ox = cal["grid_offset_x"]
    oy = cal["grid_offset_y"]

    x = ox + col * tw
    y = oy + row * th
    return frame[y:y + th, x:x + tw]


def analyze_cell_brightness(cell):
    """Quick analysis: brightness and dominant color."""
    if cell.size == 0:
        return {"empty": True, "brightness": 0, "max_brightness": 0}

    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    mean_b = float(np.mean(gray))
    max_b = int(np.max(gray))

    # Dominant color (BGR)
    mean_bgr = np.mean(cell.reshape(-1, 3), axis=0)

    # Is this cell "occupied" (has visible content)?
    # Qud has fog-of-war: distant tiles are dim. Use low threshold.
    bright_pixels = int(np.sum(gray > 30))
    occupied = bright_pixels > 3 or max_b > 45

    return {
        "empty": not occupied,
        "brightness": mean_b,
        "max_brightness": max_b,
        "bright_pixels": bright_pixels,
        "mean_bgr": mean_bgr.tolist(),
    }


def detect_entities_vision(frame, cal):
    """Detect entities from the frame using brightness + color."""
    tw = cal["tile_width"]
    th = cal["tile_height"]
    ox = cal["grid_offset_x"]
    oy = cal["grid_offset_y"]
    cols = cal["grid_cols"]
    rows = cal["grid_rows"]

    entities = []
    for row in range(rows):
        for col in range(cols):
            cell = extract_cell(frame, cal, col, row)
            analysis = analyze_cell_brightness(cell)

            if not analysis["empty"]:
                entities.append({
                    "x": col,
                    "y": row,
                    **analysis,
                })

    return entities


def compare(frame, state, cal):
    """Compare vision detections against ground truth."""
    # Ground truth entities
    gt_entities = state.get("entities", [])
    gt_positions = {(e["x"], e["y"]) for e in gt_entities}
    gt_player = (state["position"]["x"], state["position"]["y"])

    # Vision detections
    vision_entities = detect_entities_vision(frame, cal)
    vision_positions = {(e["x"], e["y"]) for e in vision_entities}

    # Metrics
    true_positives = gt_positions & vision_positions
    false_negatives = gt_positions - vision_positions  # ground truth but not detected
    false_positives_in_gt_area = vision_positions - gt_positions  # detected but no entity

    # Check player detection
    player_cell = extract_cell(frame, cal, gt_player[0], gt_player[1])
    player_analysis = analyze_cell_brightness(player_cell)
    player_detected = not player_analysis["empty"]

    print(f"=== Vision vs Ground Truth ===")
    print(f"Ground truth entities: {len(gt_entities)}")
    print(f"Vision occupied cells: {len(vision_entities)}")
    print(f"Player at {gt_player}: detected={player_detected} "
          f"(brightness={player_analysis['max_brightness']})")
    print()

    # Entity-level comparison
    print(f"True positives (GT entity in occupied cell): {len(true_positives)}/{len(gt_entities)}")
    print(f"False negatives (GT entity in empty cell): {len(false_negatives)}")
    if false_negatives:
        for pos in sorted(false_negatives):
            # Find the entity name
            name = next((e["name"] for e in gt_entities if e["x"] == pos[0] and e["y"] == pos[1]), "?")
            cell_analysis = analyze_cell_brightness(extract_cell(frame, cal, pos[0], pos[1]))
            print(f"  MISSED: {name} at {pos} "
                  f"(max_bright={cell_analysis['max_brightness']})")

    print()

    # Per-entity detail
    print(f"Per-entity details:")
    for e in gt_entities:
        pos = (e["x"], e["y"])
        cell_analysis = analyze_cell_brightness(extract_cell(frame, cal, pos[0], pos[1]))
        detected = pos in vision_positions
        dist = abs(e["x"] - gt_player[0]) + abs(e["y"] - gt_player[1])
        print(f"  {'OK' if detected else 'MISS':4s} {e['name']:30s} ({e['x']:2d},{e['y']:2d}) "
              f"dist={dist:2d} max_bright={cell_analysis['max_brightness']:3d} "
              f"{'hostile' if e.get('hostile') else ''}")

    # Summary
    recall = len(true_positives) / len(gt_entities) if gt_entities else 0
    print(f"\nRecall: {recall:.0%} ({len(true_positives)}/{len(gt_entities)})")
    print(f"Occupied cells: {len(vision_entities)} "
          f"(terrain/items make up {len(vision_entities) - len(true_positives)} of these)")

    return {
        "recall": recall,
        "true_positives": len(true_positives),
        "false_negatives": len(false_negatives),
        "total_gt": len(gt_entities),
        "total_vision": len(vision_entities),
        "player_detected": player_detected,
    }


def live_compare():
    """Run comparison on live game."""
    if not HAS_CAPTURE:
        print("Cannot do live comparison — capture module not available")
        sys.exit(1)

    # Activate Qud window
    subprocess.run(["osascript", "-e", 'tell application "CavesOfQud" to activate'],
                   capture_output=True)
    time.sleep(0.5)

    window = find_qud_window()
    if not window:
        print("Qud window not found")
        sys.exit(1)

    state = read_state(IPC_DIR)
    if not state:
        print("No state.json")
        sys.exit(1)

    with mss.mss() as sct:
        raw = sct.grab(window)
        frame = np.array(raw)[:, :, :3]

    # Convert from RGB to BGR for OpenCV
    frame_bgr = frame[:, :, ::-1]

    cal = load_calibration()
    return compare(frame_bgr, state, cal)


def main():
    parser = argparse.ArgumentParser(description="Compare vision vs ground truth")
    parser.add_argument("frame", nargs="?", help="Frame PNG path")
    parser.add_argument("state", nargs="?", help="State JSON path")
    args = parser.parse_args()

    cal = load_calibration()

    if args.frame and args.state:
        frame = cv2.imread(args.frame)
        with open(args.state) as f:
            state = json.load(f)
        compare(frame, state, cal)
    else:
        live_compare()


if __name__ == "__main__":
    main()
