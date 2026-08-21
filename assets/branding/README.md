# Production branding

`brand-master.png` is the canonical 3azza artwork: the current blue,
front-view scooter with the `3azza` plate on a transparent canvas.

Run `python scripts/generate-branding-assets.py` after intentionally replacing
the master. The script generates the authoritative runtime derivatives:

- `app-icon.png`
- `adaptive-icon-foreground.png`
- `adaptive-icon-monochrome.png`
- `splash-logo.png`
- `favicon.png`
- `notification-icon.png`

The Android adaptive background is the configured solid color `#081421`; it
does not need a bitmap. Google Play derivatives are written to `store-assets/`.

Files outside this directory are legacy or historical candidates unless a
non-branding feature explicitly references them.
