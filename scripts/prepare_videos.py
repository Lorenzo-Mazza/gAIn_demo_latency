"""Export the two supplied task recordings at their original playback speed."""

import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-directory", type=Path, default=Path.home() / "Downloads")
    args = parser.parse_args()
    config = json.loads((ROOT / "data/media.json").read_text())
    target = ROOT / "assets/videos"
    target.mkdir(parents=True, exist_ok=True)
    for model, info in config.items():
        source = args.source_directory / info["source"]
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = target / f"{model}.mp4"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(info["trim_start"]), "-i", str(source),
            "-t", str(info["trim_end"] - info["trim_start"]),
            "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
            "-vf", "scale=1920:-2", "-c:v", "libx264", "-threads", "4", "-preset", "fast",
            "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination),
        ], check=True)
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(destination),
            "-frames:v", "1", "-vf", "scale=1280:-2", str(ROOT / "assets" / f"{model}-poster.jpg"),
        ], check=True)
        print(f"Exported {model}: {info['trim_start']}–{info['trim_end']} seconds")


if __name__ == "__main__":
    main()
