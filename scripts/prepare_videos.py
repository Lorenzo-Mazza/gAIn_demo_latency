"""Export the two supplied task recordings at their original playback speed."""

import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def filter_graph(info):
    """Keep the tool sharp and feather a strong blur over the background person."""
    x, y, width, height = info["background_mask"]
    crop_x, crop_y, crop_w, crop_h = info["crop"]
    alpha = "255*clip(min(min(X,W-1-X),min(Y,H-1-Y))/28,0,1)"
    return (
        "[0:v]scale=1920:1080,split[scene][region];"
        f"[region]crop={width}:{height}:{x}:{y},boxblur=26:3,format=yuva420p,"
        f"geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='{alpha}'[privacy];"
        f"[scene][privacy]overlay={x}:{y}:format=auto,"
        f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},scale=1920:1080,format=yuv420p[out]"
    )


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
            "-ss", str(info["trim_start"]), "-threads", "4", "-i", str(source),
            "-t", str(info["trim_end"] - info["trim_start"]),
            "-filter_complex_threads", "4", "-filter_complex", filter_graph(info),
            "-map", "[out]", "-an", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
            "-c:v", "libx264", "-threads", "4", "-preset", "fast",
            "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination),
        ], check=True)
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(destination),
            "-frames:v", "1", "-vf", "scale=1280:-2", str(ROOT / "assets" / f"{model}-poster.jpg"),
        ], check=True)
        print(f"Exported {model}: {info['trim_start']}–{info['trim_end']} seconds, cropped and background person blurred", flush=True)


if __name__ == "__main__":
    main()
