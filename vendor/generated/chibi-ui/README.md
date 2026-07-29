# Chibi UI asset sources

These assets were generated for this project and are dedicated to CC0 by the
project. They are not attributed to a third-party artist or commercial pack.

- `source/chef-sheet.png` — project-owner supplied chef sheet used verbatim as
  the player-character source. The build only removes the white background,
  crops its existing frames, and downsamples them for the runtime atlas.
- `source/surfaces-sheet.png` — project-generated orthographic floor, wall, and
  doorway source sheet.
- `source/furniture-sheet.png` — project-generated orthographic furniture and
  kitchen-station source sheet.
- `source/furniture-sheet-v2.png` — project-generated correction that removes
  the unintended third chair from the three table-state sprites; the original
  sheet remains the source for every kitchen station.
- `source/*-keyed.png` — reproducible chroma-key extractions retained so the
  runtime build does not depend on an external image service.
- `guest-frames/` — project-generated chibi guest frames retained from the
  earlier Storybook v2 iteration because they match the requested cast style.

`scripts/build-chibi-ui-assets.py` is the reproducible crop/key/downsample step.
Generated runtime-ready frames are written beside this README and are then
packed by `scripts/build-assets.ts`.
