#!/usr/bin/env python3
"""
Calibrate the viewport grid mapping.

Finds the player character (@) and known entities in a captured frame,
uses their ground truth positions to compute the exact viewport rect
and tile size.

Usage:
    python calibrate.py dataset/frame_00000.png dataset/state_00000.json
    python calibrate.py --live   # calibrate from live game
"""

import argparse
import json
import sys
import time
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


def find_bright_spots(frame, min_brightness=180, min_area=5):
    """Find bright spots in the frame that could be entity tiles."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, min_brightness, 255, cv2.THRESH_BINARY)

    # Clean up noise
    kernel = np.ones((2, 2), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    spots = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        M = cv2.moments(c)
        if M["m00"] == 0:
            continue
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])
        x, y, w, h = cv2.boundingRect(c)
        spots.append({
            "center": (cx, cy),
            "bbox": (x, y, w, h),
            "area": area,
        })

    return sorted(spots, key=lambda s: s["area"], reverse=True)


def find_grid_lines(frame, axis="vertical"):
    """
    Detect repeating grid lines in the viewport.

    Qud renders tiles on a fixed grid. By looking at vertical/horizontal
    patterns in brightness, we can detect the grid spacing.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    if axis == "vertical":
        # Sum along rows to get column brightness profile
        profile = np.mean(gray, axis=0)
    else:
        # Sum along columns to get row brightness profile
        profile = np.mean(gray, axis=1)

    # Find periodic pattern using autocorrelation
    profile = profile - np.mean(profile)
    corr = np.correlate(profile, profile, mode="full")
    corr = corr[len(corr) // 2:]  # take positive half

    # Find first significant peak after lag 0
    # This gives us the grid spacing
    min_spacing = 5  # tiles must be at least 5px
    max_spacing = 30  # and at most 30px

    peaks = []
    for i in range(min_spacing, min(max_spacing, len(corr) - 1)):
        if corr[i] > corr[i - 1] and corr[i] > corr[i + 1]:
            peaks.append((i, corr[i]))

    if peaks:
        # Return the spacing with highest correlation
        best = max(peaks, key=lambda p: p[1])
        return best[0]

    return None


def find_viewport_bounds(frame):
    """
    Find the game viewport boundaries within the window.

    The viewport is the main tile area, excluding:
    - Window title bar (top)
    - Sidebar (right)
    - Message log (bottom)

    Strategy: look for the large dark rectangular region with tile content.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # Row brightness profile — find where the viewport starts (after title/menu)
    row_means = np.mean(gray, axis=1)

    # The viewport area is typically darker than UI chrome
    # Find the first row where brightness drops (start of viewport)
    # and last row where it's still low (end of viewport)

    # Column profile — find where sidebar starts
    col_means = np.mean(gray, axis=0)

    # Viewport is the dark region; sidebar is slightly brighter
    # Look for a significant brightness jump in the right portion
    right_quarter = col_means[w * 2 // 3:]
    sidebar_offset = w * 2 // 3

    # Find first column in right quarter where brightness jumps
    sidebar_start = w  # default: no sidebar
    for i in range(1, len(right_quarter)):
        if right_quarter[i] > np.mean(col_means) * 1.5:
            sidebar_start = sidebar_offset + i
            break

    return {
        "viewport_width": sidebar_start,
        "viewport_height": h,
        "sidebar_start": sidebar_start,
    }


def calibrate_from_frame(frame, state):
    """
    Main calibration function.

    Uses the frame + ground truth to determine:
    - Viewport pixel rect (x, y, w, h)
    - Tile size (tw, th)
    - Grid offset (where tile 0,0 starts in pixels)
    """
    h, w = frame.shape[:2]
    print(f"Frame: {w}x{h}")

    player_x = state["position"]["x"]
    player_y = state["position"]["y"]
    print(f"Player at game position: ({player_x}, {player_y})")

    # Step 1: Find viewport bounds
    bounds = find_viewport_bounds(frame)
    print(f"Viewport bounds: {bounds}")

    # Step 2: Find grid spacing
    # Crop to approximate viewport area first
    viewport_crop = frame[:, :bounds["sidebar_start"]]
    tw = find_grid_lines(viewport_crop, "vertical")
    th = find_grid_lines(viewport_crop, "horizontal")
    print(f"Grid spacing detected: tw={tw}, th={th}")

    # Step 3: Find the player character
    # The player @ is typically one of the brightest white spots
    spots = find_bright_spots(viewport_crop)
    print(f"Found {len(spots)} bright spots")

    if spots and tw and th:
        # The player should be at grid position (player_x, player_y)
        # For each bright spot, check if it could be the player
        # by computing what the grid offset would need to be
        print("\nTop 10 bright spots (potential player):")
        for i, s in enumerate(spots[:10]):
            cx, cy = s["center"]
            # If this is the player, the grid offset would be:
            offset_x = cx - player_x * tw
            offset_y = cy - player_y * th
            print(f"  #{i}: pixel ({cx},{cy}) area={s['area']:.0f} "
                  f"→ grid_offset=({offset_x:.0f},{offset_y:.0f})")

    # Step 4: Try to validate with entities
    entities = state.get("entities", [])
    if entities and tw and th:
        print(f"\nGround truth entities ({len(entities)}):")
        for e in entities[:5]:
            print(f"  {e['name']} at ({e['x']},{e['y']})"
                  f" hostile={e.get('hostile', False)}")

    # Step 5: Brute-force search for best grid alignment
    if tw and th:
        print(f"\n--- Searching for best grid alignment (tw={tw}, th={th}) ---")
        best_score = 0
        best_offset = (0, 0)

        # The player tile should have high brightness
        gray = cv2.cvtColor(viewport_crop, cv2.COLOR_BGR2GRAY)

        for ox in range(tw):
            for oy in range(th):
                px = ox + player_x * tw
                py = oy + player_y * th
                if px + tw > viewport_crop.shape[1] or py + th > viewport_crop.shape[0]:
                    continue
                cell = gray[py:py + th, px:px + tw]
                brightness = np.max(cell)
                if brightness > best_score:
                    best_score = brightness
                    best_offset = (ox, oy)

        print(f"Best offset: ({best_offset[0]}, {best_offset[1]}) "
              f"(brightness={best_score})")

        # Validate: check entity positions
        ox, oy = best_offset
        print("\nValidation — checking entity pixel positions:")
        for e in entities[:8]:
            px = ox + e["x"] * tw
            py = oy + e["y"] * th
            if px + tw <= viewport_crop.shape[1] and py + th <= viewport_crop.shape[0]:
                cell = gray[py:py + th, px:px + tw]
                bright = np.max(cell)
                mean_bright = np.mean(cell)
                print(f"  {e['name']:20s} ({e['x']:2d},{e['y']:2d}) "
                      f"→ pixel ({px},{py}) max_bright={bright:.0f} "
                      f"mean={mean_bright:.1f}")

        # Output calibration result
        result = {
            "viewport_rect": [best_offset[0], best_offset[1],
                              80 * tw, 25 * th],
            "tile_size": [tw, th],
            "grid_offset": list(best_offset),
            "frame_size": [w, h],
        }
        print(f"\n=== CALIBRATION RESULT ===")
        print(json.dumps(result, indent=2))

        # Save calibration
        cal_path = Path(__file__).parent / "calibration.json"
        with open(cal_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Saved to {cal_path}")

        return result

    return None


def live_calibrate():
    """Calibrate from the live game."""
    if not HAS_CAPTURE:
        print("Cannot do live calibration — capture module not available")
        sys.exit(1)

    window = find_qud_window()
    if not window:
        print("Qud window not found")
        sys.exit(1)

    state = read_state(IPC_DIR)
    if not state:
        print("No state.json — is the mod running?")
        sys.exit(1)

    print(f"Window: {window}")
    print(f"Character: {state['name']} at ({state['position']['x']},{state['position']['y']})")

    with mss.mss() as sct:
        raw = sct.grab(window)
        frame = np.array(raw)[:, :, :3]

    return calibrate_from_frame(frame, state)


def main():
    parser = argparse.ArgumentParser(description="Calibrate Qud viewport grid")
    parser.add_argument("frame", nargs="?", help="Path to captured frame PNG")
    parser.add_argument("state", nargs="?", help="Path to ground truth state JSON")
    parser.add_argument("--live", action="store_true", help="Calibrate from live game")
    args = parser.parse_args()

    if args.live:
        live_calibrate()
    elif args.frame and args.state:
        frame = cv2.imread(args.frame)
        if frame is None:
            print(f"Could not load {args.frame}")
            sys.exit(1)
        with open(args.state) as f:
            state = json.load(f)
        calibrate_from_frame(frame, state)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
