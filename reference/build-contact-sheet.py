#!/usr/bin/env python3
"""Create a review sheet from source-video frames extracted at one frame/second."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
times = [4, 12, 14, 20, 24, 28, 37, 43, 48, 54, 58, 61, 66, 69, 73, 75, 77, 85, 95, 103]
width, height, label = 320, 180, 23
sheet = Image.new("RGB", (width * 4, (height + label) * 5), "#151515")
draw = ImageDraw.Draw(sheet)
for index, second in enumerate(times):
    # ffmpeg fps=1 numbers its first (approximately 0s) frame 001.
    frame = Image.open(root / "stills" / f"frame-{second + 1:03d}.jpg")
    frame = frame.resize((width, height), Image.Resampling.LANCZOS)
    x, y = (index % 4) * width, (index // 4) * (height + label)
    sheet.paste(frame, (x, y))
    draw.text((x + 8, y + height + 5), f"{second // 60:02d}:{second % 60:02d} (approx.)", fill="white")
sheet.save(root / "contact-sheet.jpg", quality=92)
print(root / "contact-sheet.jpg")
