#!/usr/bin/env bash
set -euo pipefail
reference_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
reference_flake="path:$reference_dir/..#reference"
source_url='https://www.youtube.com/watch?v=maAFcEU6atk'

# NixOS: the JS runtime and player clients are needed to avoid the default
# Android client's HTTP 403 response for this particular upload.
nix develop "$reference_flake" -c yt-dlp \
  --no-playlist --js-runtimes deno --remote-components ejs:github \
  --extractor-args 'youtube:player_client=tv,web_embedded' \
  --write-info-json --write-subs --write-auto-subs --sub-langs 'en.*' \
  --write-thumbnail -f 'best[height<=720]/bestvideo[height<=720]+bestaudio' \
  --merge-output-format mp4 -o "$reference_dir/celery-man.%(ext)s" "$source_url"

mkdir -p "$reference_dir/stills"
nix develop "$reference_flake" -c ffmpeg -y -hide_banner -loglevel error \
  -i "$reference_dir/celery-man.mp4" -vf fps=1 -q:v 2 \
  "$reference_dir/stills/frame-%03d.jpg"
nix develop "$reference_flake" -c python3 "$reference_dir/build-contact-sheet.py"
