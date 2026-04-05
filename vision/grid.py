#!/usr/bin/env python3
"""
Qud viewport grid analyzer.

Divides the game viewport into the 80x25 tile grid and extracts:
- Dominant colors per cell (mapped to Qud's 18-color palette)
- Tile identification via template matching against hagadias-extracted tiles
- Entity detection based on color + tile classification

This is the fast perception layer (<5ms for full screen).
"""

import numpy as np
import cv2
from pathlib import Path

# Qud's 18-color palette (approximate RGB values from the game's default palette)
# These will need calibration against actual captured frames.
QUD_PALETTE = {
    "black":    (0, 0, 0),
    "blue":     (0, 0, 170),
    "green":    (0, 170, 0),
    "cyan":     (0, 170, 170),
    "red":      (170, 0, 0),
    "magenta":  (170, 0, 170),
    "brown":    (170, 85, 0),
    "gray":     (170, 170, 170),
    "darkgray": (85, 85, 85),
    "bblue":    (85, 85, 255),
    "bgreen":   (85, 255, 85),
    "bcyan":    (85, 255, 255),
    "bred":     (255, 85, 85),
    "bmagenta": (255, 85, 255),
    "yellow":   (255, 255, 85),
    "white":    (255, 255, 255),
    "orange":   (217, 145, 33),
    "transparent": (0, 0, 0),
}

# Convert to numpy array for vectorized nearest-color lookup
_PALETTE_NAMES = list(QUD_PALETTE.keys())
_PALETTE_RGB = np.array(list(QUD_PALETTE.values()), dtype=np.float32)


def nearest_palette_color(rgb: np.ndarray) -> str:
    """Map an RGB value to the nearest Qud palette color."""
    dists = np.sum((_PALETTE_RGB - rgb.astype(np.float32)) ** 2, axis=1)
    return _PALETTE_NAMES[np.argmin(dists)]


class QudGrid:
    """Extracts the 80x25 tile grid from a Qud screenshot."""

    def __init__(self, viewport_rect: tuple[int, int, int, int] = None,
                 tile_size: tuple[int, int] = None):
        """
        Args:
            viewport_rect: (x, y, w, h) of the game viewport within the window.
                           If None, auto-detect on first frame.
            tile_size: (width, height) of a single tile in pixels.
                       If None, calculated from viewport_rect / (80, 25).
        """
        self.viewport_rect = viewport_rect
        self.tile_size = tile_size
        self.grid_cols = 80
        self.grid_rows = 25
        self._calibrated = viewport_rect is not None

    def calibrate(self, frame: np.ndarray):
        """
        Auto-detect the viewport rectangle and tile size from a frame.

        Strategy: Qud's viewport has a distinct border. Find the main
        content area by looking for the rectangular region with the most
        color variation (the game world), excluding UI chrome.

        For now, use a conservative default and refine from ground truth.
        """
        h, w = frame.shape[:2]

        # Conservative default: assume viewport is roughly centered
        # with some UI margins. This WILL need tuning per resolution.
        # At 1920x1080, Qud's viewport is roughly 1280x600 starting ~40px from top.
        # These are starting estimates — Phase 1 capture data will give us exact values.
        margin_top = int(h * 0.04)
        margin_bottom = int(h * 0.15)
        margin_left = int(w * 0.01)
        margin_right = int(w * 0.01)

        vw = w - margin_left - margin_right
        vh = h - margin_top - margin_bottom

        self.viewport_rect = (margin_left, margin_top, vw, vh)
        self.tile_size = (vw // self.grid_cols, vh // self.grid_rows)
        self._calibrated = True

    def extract_viewport(self, frame: np.ndarray) -> np.ndarray:
        """Crop the frame to just the game viewport."""
        if not self._calibrated:
            self.calibrate(frame)

        x, y, w, h = self.viewport_rect
        return frame[y:y + h, x:x + w]

    def get_cell(self, viewport: np.ndarray, col: int, row: int) -> np.ndarray:
        """Extract a single tile cell from the viewport."""
        tw, th = self.tile_size
        x1 = col * tw
        y1 = row * th
        return viewport[y1:y1 + th, x1:x1 + tw]

    def analyze_cell(self, cell: np.ndarray) -> dict:
        """
        Analyze a single tile cell.

        Returns:
            {
                "fg_color": nearest palette color name for foreground,
                "bg_color": nearest palette color name for background,
                "is_empty": True if cell appears to be empty/black,
                "brightness": average brightness (0-255),
            }
        """
        if cell.size == 0:
            return {"fg_color": "black", "bg_color": "black", "is_empty": True, "brightness": 0}

        # Convert to RGB if BGR
        rgb = cell[:, :, ::-1] if cell.shape[2] == 3 else cell[:, :, :3]

        # Separate foreground from background using brightness
        gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))

        if brightness < 10:
            return {"fg_color": "black", "bg_color": "black", "is_empty": True, "brightness": brightness}

        # Background: most common color (mode of pixels)
        # Foreground: brightest non-background pixels
        # Simple approach: threshold to separate fg/bg
        _, mask = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)

        fg_pixels = rgb[mask > 0]
        bg_pixels = rgb[mask == 0]

        fg_color = "black"
        bg_color = "black"

        if len(fg_pixels) > 0:
            fg_mean = np.mean(fg_pixels, axis=0)
            fg_color = nearest_palette_color(fg_mean)

        if len(bg_pixels) > 0:
            bg_mean = np.mean(bg_pixels, axis=0)
            bg_color = nearest_palette_color(bg_mean)

        return {
            "fg_color": fg_color,
            "bg_color": bg_color,
            "is_empty": False,
            "brightness": brightness,
        }

    def analyze_frame(self, frame: np.ndarray) -> list[list[dict]]:
        """
        Analyze the full 80x25 grid.

        Returns a 2D list [row][col] of cell analysis dicts.
        """
        viewport = self.extract_viewport(frame)
        grid = []

        for row in range(self.grid_rows):
            row_data = []
            for col in range(self.grid_cols):
                cell = self.get_cell(viewport, col, row)
                row_data.append(self.analyze_cell(cell))
            grid.append(row_data)

        return grid

    def find_entities(self, grid: list[list[dict]]) -> list[dict]:
        """
        Identify likely entities from the grid analysis.

        Entities in Qud are typically bright-colored tiles on dark backgrounds.
        Common entity colors: bred (hostile), bgreen (friendly), white (neutral),
        yellow (items), cyan (water/liquid).
        """
        entities = []
        entity_colors = {"bred", "bmagenta", "red", "white", "bgreen", "yellow", "bcyan", "orange"}

        for row_idx, row in enumerate(grid):
            for col_idx, cell in enumerate(row):
                if cell["is_empty"]:
                    continue
                if cell["fg_color"] in entity_colors and cell["brightness"] > 50:
                    entities.append({
                        "x": col_idx,
                        "y": row_idx,
                        "fg_color": cell["fg_color"],
                        "bg_color": cell["bg_color"],
                        "brightness": cell["brightness"],
                    })

        return entities


def benchmark(frame: np.ndarray):
    """Benchmark grid analysis speed."""
    import time

    grid_analyzer = QudGrid()
    grid_analyzer.calibrate(frame)

    # Warm up
    grid_analyzer.analyze_frame(frame)

    # Benchmark
    times = []
    for _ in range(100):
        t0 = time.perf_counter()
        grid = grid_analyzer.analyze_frame(frame)
        entities = grid_analyzer.find_entities(grid)
        times.append(time.perf_counter() - t0)

    avg_ms = np.mean(times) * 1000
    p95_ms = np.percentile(times, 95) * 1000
    print(f"Grid analysis: avg={avg_ms:.1f}ms, p95={p95_ms:.1f}ms ({len(entities)} entities found)")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        # Benchmark on a saved frame
        frame = cv2.imread(sys.argv[1])
        if frame is None:
            print(f"Could not load {sys.argv[1]}")
            sys.exit(1)
        benchmark(frame)
    else:
        print("Usage: python grid.py <frame.png>")
        print("  Benchmarks grid analysis on a saved frame")
