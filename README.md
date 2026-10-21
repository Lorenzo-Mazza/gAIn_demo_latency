# gAIn demo · latency

A screen-focused comparison of the FP32 and gAIn surgical AI models: two task recordings, phase completion overlays, and measured latency curves. Plain HTML, CSS, and JavaScript; no production dependencies, external fonts, analytics, or build step.

## Preview

```sh
npm start
```

Open http://localhost:4173. Use the full-screen button or **F** for the exhibition display, **Space** to pause/resume, and **R** to replay both recordings. The shorter recording holds its last frame until the longer recording finishes; both then replay together. A large green tick appears on the gAIn video when its recording finishes and clears on replay. Playback is at the original speed.

The two latency curves draw continuously from left to right with their respective videos. The drawing pauses with playback, holds the finished gAIn trace, and resets when both recordings replay. Switching the latency metric or resizing the page preserves the current reveal position.

The local server uses only Node's built-in modules and supports HTTP byte ranges so video seeking works before the full files have buffered.

Both videos and their poster frames display at 80% brightness to reduce glare on the screen. This adjustment is applied to the video elements in CSS.

## Recordings and phase ticks

The videos are muted 1080p H.264 MP4 exports of the supplied recordings, tightly centered on the bowel and instrument tips. The crops match their apparent scale: FP32 uses 768 × 432 (2.50× zoom), and gAIn uses 640 × 360 (3.00× zoom) in normalized 1920 × 1080 coordinates. Both views are 50% closer than the previous version; the tighter gAIn crop compensates for its wider camera view. Framing was compared at the start, grasp, and stretch phases. The exporter maps these coordinates directly to the original source pixels before resizing, preserving the gAIn recording's 4K detail. Background-person masking remains in the export pipeline. Crop and blur coordinates are stored in `data/media.json`. Phase completion times were supplied by Lorenzo Mazza. Times in the source recordings:

| Model | Source | Keep | Reach | Grasp | Stretch |
| --- | --- | --- | --- | --- | --- |
| FP32 | IMG_5318.MOV | 0:03–0:48 | 0:33 | 0:36 | 0:47 |
| gAIn | IMG_5333.MOV | 0:01–0:18 | 0:06 | 0:08 | 0:16 |

The FP32 cut retains one second after the final milestone. The phase times in `data/media.json` are relative to the trimmed files: FP32 30/33/44 seconds; gAIn 5/7/15 seconds. Seeking and replaying update the ticks in either direction. The gAIn milestone described as retraction uses the shared on-screen label “Stretch.”

`scripts/prepare_videos.py` regenerates both web videos and posters from the original MOV files in `~/Downloads`, using this configuration. It removes audio and original phone/location metadata and preserves playback speed. Original source recordings are not modified or included in the repository.

Use `python3 scripts/prepare_videos.py --model gain` to rebuild only the right-hand recording.

## Latency curves

`data/latency.json` contains the unmodified per-prediction measurements from the poster's `latency_samples.csv`, excluding step 0 from each recording. There are 59 FP32 and 60 gAIn measurements. The curves connect the actual samples without smoothing or resampling. Both plots use the same 0–1,000 ms vertical scale. Switch between AI computation and the full logged cycle (preprocessing, inference, postprocessing).

| Measurement | FP32 mean | gAIn mean | Speedup |
| --- | --- | --- | --- |
| AI computation | 776.4339 ms | 249.5100 ms | 3.1118× |
| Complete cycle | 936.9932 ms | 398.7800 ms | 2.3496× |

The logs are separate Raspberry Pi recordings. The animation reveals each complete recorded trace over the duration of its corresponding trimmed video; this is presentation timing, not live or timestamp-matched video telemetry. The measured values and displayed means are unchanged. Full-cycle latency excludes robot motion duration. The model uses quantization-aware training, INT4 grouped linear weights and dynamic INT8 activations, with other operations retaining floating point.

## Branding and type

The official gAIn logo is reused unchanged from the supplied gAIn poster template. The page uses the same gAIn Sans typeface as the poster, a static Nunito Sans derivative. The font license is in `assets/fonts/OFL.txt`. All assets are served locally.

## GitHub Pages

Publish the `main` branch from `/` in **Settings → Pages**. `.nojekyll` enables direct static hosting. All asset URLs are relative and support a project path such as `/gAIn_demo_latency/`.

## Verification

```sh
npm install
npx playwright install chromium --only-shell
npm run check
npm start
# In another terminal:
npm test
```

The browser checks cover autoplay and original playback speed, shared playback controls, curve growth and pause/replay behavior, trim-relative phase timing, the final gAIn completion tick and its reset on replay, the two measured curve series and metric toggle, keyboard inspection, and desktop/mobile layouts. Screenshots are written to the ignored `artifacts/` directory.
