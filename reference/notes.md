# Celery Man reference study

Source: [Tim and Eric - Celery Man, uploaded by Twinfold11](https://www.youtube.com/watch?v=maAFcEU6atk), 108 seconds. Inspected on 2026-09-04.

## Acquisition status

- **Video downloaded successfully:** `celery-man.mp4`, 640×360 with audio, approximately 3.88 MiB.
- **Transcript acquired:** YouTube English automatic captions in `celery-man.en.vtt` and `celery-man.en-orig.vtt`. These are machine captions, not a verified verbatim transcript. They misrecognize Tayne, Flarhgunnstow, and 4d3d3d3; use the source screen text for those names.
- **Stills extracted:** `stills/frame-001.jpg` onward at one frame per second. The file number is approximately timestamp in seconds plus one. `contact-sheet.jpg` is a selected visual overview.
- **Additional direct source material:** `storyboards/board-00.jpg` through `board-12.jpg` contain YouTube's 320×180 storyboard frames. `celery-man.webp` is the upload thumbnail; `celery-man.info.json` is yt-dlp metadata.
- Initial yt-dlp default/Android-client attempts returned HTTP 403 for the media stream. Using Deno, EJS, and `tv,web_embedded` clients succeeded. `./reference/fetch-reference.sh` records the working Nix command and regenerates stills/contact sheet.
- Downloaded source media and captions are research material, not app runtime assets. They should not be bundled into a deployed build.

## Visual observations from the video

| Approximate time | Direct observation | Application implication |
| --- | --- | --- |
| 00:00–00:12 | Office worker approaches a small metal desk on a circular platform inside an enormous luminous blue chamber. Three flat monitors, simple keyboard, white coffee mug. | Treat ridiculous avatar manipulation as serious daily office work. A calm utility interface is more faithful than a modern marketing page. |
| 00:12–00:16 | Solid bright cyan/teal desktop. A small gray loader has a yellow/orange gradient and a dark gridded 3D head, titled **Cinco Identity Generator 2.5**. A separate narrow black window types the computer's greeting in white. | Teal workspace, gray square windows, small type, deliberate loading state, a terse computer response pane. |
| 00:19–00:24 | Loading bar is deep royal blue. A tall white/light-gray full-body window appears at right; a separate smaller portrait player grows at left with a saturated pink/magenta background. | Keep the generated character and its inspection preview visible together. Full body is isolated against a neutral background, not placed in a detailed scene. |
| 00:24–00:38 | Celery Man wears a shiny dark silver/charcoal suit, white shirt, skinny black tie. His loose, looped dance becomes more enthusiastic after the intensity command. | Short repetitive dance cycles, slightly stiff limbs, meaningful intensity control. “Celery Man” is a human persona, not a literal celery vegetable. |
| 00:41–00:45 | Oyster's portrait and larger full-body window layer over the existing Celery windows. Red jacket, black shirt and pants, red patterned beanie, black choker; hunched, emphatic arm movements. Portrait background turns green; full body uses a pale yellow gradient. | Loading another sequence can preserve other dancers and layer new windows. Name, costume, background, and motion distinguish each identity. |
| 00:46–00:49 | A request to print Oyster smiling immediately results in a physical portrait printout. | Snapshot/print is a first-class, delightfully mundane action. |
| 00:52–00:59 | A larger black text pane proposes a beta sequence, followed by another old gray dialog and blue loading bar. | Keep computer replies brief, confident, and literal; beta status is part of the fiction. |
| 00:59–01:11 | Tayne wears a black fedora, sunglasses, gold/brown patterned shirt, black trousers and shoes. Portrait and full-body windows grow and duplicate; a pink/orange card displays his name in large black condensed lettering. | A character can have a clear silhouette, accessories, a title card, and an energetic stepping/squatting loop. |
| 01:12–01:14 | Hat-wobble command triggers a cascade of pink portrait windows, with the head/hat centered in each. | Hat tilt animation plus optional echoing/cascading windows makes the action read. |
| 01:14–01:17 | Flarhgunnstow spreads arms, steps sideways, and produces multiple full-body instances. | Exaggerated arms and coordinated clones are useful signature motions. |
| 01:23–01:28 | Large red warning letters and a gray NSFW dialog interrupt the desktop. | Source uses abrupt, oversized system feedback for comic emphasis. |
| 01:34–01:38 | Incoming-call mini-window overlays the active character; pink panel, white telephone icon, caller label. | Small utilitarian interruptions can inhabit the same window system. |
| 01:40–01:47 | Overlapping gray sequence windows proliferate, including a beta/improper-coding error, portraits, and full bodies. | Controlled window cascades and low-fi system behavior express the escalating absurdity. |

## Concrete style direction

The desktop is a nearly flat cyan-teal (roughly `#00a9bc`, varying with the captured footage), surrounded by neutral Windows 95/early desktop chrome. Gray beveled edges, thin black inset lines, blue selection/progress strips, small system sans type, tiny close buttons and scroll bars matter more than elaborate CRT effects. Active content supplies saturated magenta, orange/yellow, and green. Windows vary greatly in aspect ratio and overlap with little concern for a polished grid.

The humor comes from a polite, businesslike command loop applied to nonsensical dancing identities. Loading, inspecting, rotating, asking for a specific motion, increasing intensity, proposing a new beta, and printing a portrait should feel like real work with immediate visible results. Generated low-poly 3D characters can reinterpret the source's cutout footage while preserving costumes, stiff looping movement, sparse backgrounds, repeated instances, and confident computer language.

Audio direction for an original implementation: simple synthesized arpeggios, small beeps, and an optional dry computer voice. The downloaded audio is available for human review; no source music or dialogue needs to be shipped with the app.
