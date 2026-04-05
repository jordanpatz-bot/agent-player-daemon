#!/usr/bin/env python3
"""
Phase 1: Bootstrap capture.

Captures Qud screen frames alongside the C# mod's state.json ground truth.
Saves paired (screenshot, state) samples for building the vision pipeline.

Usage:
    python capture.py [--interval 2.0] [--output ./dataset] [--window "Caves of Qud"]

Requires Caves of Qud running with the AgentBridge mod (writes state.json).
"""

import argparse
import json
import time
import os
import sys
from pathlib import Path
from datetime import datetime

import mss
import numpy as np
from PIL import Image

# Default paths
IPC_DIR = Path.home() / "mud-daemon-gamestate" / "mud-daemon" / "data" / "qud" / "ipc"
DEFAULT_OUTPUT = Path(__file__).parent / "dataset"


def find_qud_window():
    """Find the Caves of Qud window bounds using pyobjc (macOS).
    Picks the LARGEST CavesOfQud window (avoids title bar / toolbar fragments)."""
    try:
        import Quartz
        windows = Quartz.CGWindowListCopyWindowInfo(
            Quartz.kCGWindowListOptionAll,
            Quartz.kCGNullWindowID
        )
        candidates = []
        for w in windows:
            name = w.get(Quartz.kCGWindowName, "") or ""
            owner = w.get(Quartz.kCGWindowOwnerName, "") or ""
            if "Caves of Qud" in name or "CavesOfQud" in name or "CavesOfQud" in owner or "CoQ" in owner:
                bounds = w[Quartz.kCGWindowBounds]
                info = {
                    "left": int(bounds["X"]),
                    "top": int(bounds["Y"]),
                    "width": int(bounds["Width"]),
                    "height": int(bounds["Height"]),
                }
                candidates.append(info)
        if not candidates:
            return None
        # Return the largest window by area
        return max(candidates, key=lambda c: c["width"] * c["height"])
    except ImportError:
        print("[WARN] pyobjc-framework-Quartz not installed — using full screen capture")
        return None


def read_state(ipc_dir: Path):
    """Read the mod's state.json ground truth."""
    state_path = ipc_dir / "state.json"
    try:
        with open(state_path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def capture_frame(sct, monitor: dict) -> np.ndarray:
    """Capture a single frame as a numpy array (BGR)."""
    raw = sct.grab(monitor)
    # mss returns BGRA, convert to BGR for OpenCV compatibility
    img = np.array(raw)[:, :, :3]  # drop alpha
    return img


def save_sample(output_dir: Path, idx: int, frame: np.ndarray, state: dict):
    """Save a paired (screenshot, state) sample."""
    frame_path = output_dir / f"frame_{idx:05d}.png"
    state_path = output_dir / f"state_{idx:05d}.json"

    Image.fromarray(frame[:, :, ::-1]).save(frame_path)  # BGR → RGB for PIL
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)

    return frame_path, state_path


def main():
    parser = argparse.ArgumentParser(description="Capture Qud frames + ground truth")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between captures")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT), help="Output directory")
    parser.add_argument("--count", type=int, default=0, help="Max frames (0=unlimited)")
    parser.add_argument("--ipc-dir", type=str, default=str(IPC_DIR), help="Mod IPC directory")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    ipc_dir = Path(args.ipc_dir)

    # Find Qud window
    print("[CAPTURE] Looking for Caves of Qud window...")
    window = find_qud_window()
    if window:
        print(f"[CAPTURE] Found window: {window['width']}x{window['height']} at ({window['left']},{window['top']})")
        monitor = window
    else:
        print("[CAPTURE] Window not found — will capture primary monitor")
        monitor = None

    # Check mod is running
    state = read_state(ipc_dir)
    if not state:
        print(f"[CAPTURE] No state.json at {ipc_dir}. Is Qud running with AgentBridge?")
        sys.exit(1)
    print(f"[CAPTURE] Mod connected: {state.get('name', '?')} in {state.get('zoneName', '?')}")

    print(f"[CAPTURE] Saving to {output_dir}/ every {args.interval}s")
    print("[CAPTURE] Press Ctrl+C to stop\n")

    idx = 0
    prev_turn = None

    with mss.mss() as sct:
        if monitor is None:
            monitor = sct.monitors[1]  # primary monitor

        while True:
            state = read_state(ipc_dir)
            if not state:
                print("[CAPTURE] Lost state.json — waiting...")
                time.sleep(1)
                continue

            # Only capture on new game turns (avoids redundant frames)
            turn = state.get("turn")
            if turn == prev_turn:
                time.sleep(0.2)
                continue
            prev_turn = turn

            frame = capture_frame(sct, monitor)
            frame_path, state_path = save_sample(output_dir, idx, frame, state)

            # Summary
            hp = f"{state.get('hp', '?')}/{state.get('maxHp', '?')}"
            pos = state.get("position", {})
            entities = len(state.get("entities", []))
            msgs = len(state.get("messages", []))
            print(
                f"[{idx:5d}] T{turn} | {state.get('name','?')} HP:{hp} "
                f"({pos.get('x','?')},{pos.get('y','?')}) | "
                f"{entities} entities, {msgs} msgs | {frame_path.name}"
            )

            idx += 1
            if args.count and idx >= args.count:
                print(f"\n[CAPTURE] Reached {args.count} frames. Done.")
                break

            time.sleep(args.interval)

    # Write dataset metadata
    meta = {
        "created": datetime.now().isoformat(),
        "frames": idx,
        "interval_s": args.interval,
        "window": window,
        "ipc_dir": str(ipc_dir),
    }
    with open(output_dir / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\n[CAPTURE] Saved {idx} frames to {output_dir}/")


if __name__ == "__main__":
    main()
