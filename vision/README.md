# Vision Pipeline

Machine vision perception layer for the game AI agent. Captures game screen, extracts structured state, outputs `vision-state.json` in the same format as the C# mod's `state.json`.

## Phase 1: Bootstrap (current)

Capture frames alongside the C# mod's ground truth to build a labeled dataset and validate the vision pipeline.

## Setup

```bash
cd vision
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

```bash
# Phase 1: capture frames + ground truth pairs
python capture.py

# Phase 2+: run vision server (outputs vision-state.json)
python server.py
```
