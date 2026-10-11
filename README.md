# Collage Builder

Collage Builder is a local-first browser editor for arranging photos into clean, exportable collages. It runs as a static web app: imported images, projects, and recovery saves stay in your browser unless you explicitly save or export them.

## What it does

- Imports JPEG, PNG, WebP, HEIC, and HEIF images.
- Builds multi-page collages with rectangular layouts.
- Adjusts cropping, padding, gaps, corner radius, frame color, and shadows.
- Saves portable `.collage` projects or smaller linked `.collage.json` projects.
- Exports one page, every page, or a page range as PNG or JPEG.
- Keeps bounded local recovery saves and works offline after the first production visit.

## Run locally

Requires Bun 1.4 or newer. The development and CI version is pinned in `.bun-version`.

```sh
bun install --frozen-lockfile
bun run dev
```

For a production build, run `bun run build`. The output in `dist/` can be served by any static HTTPS host.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Privacy](PRIVACY.md)
- [Development](docs/DEVELOPMENT.md)
- [Offline use and self-hosting](docs/OFFLINE.md)
- [Releasing](docs/RELEASING.md) and [changelog](CHANGELOG.md)
- [Support](SUPPORT.md) and [security policy](SECURITY.md)

## License

Copyright 2026 Timothy Johnson. Licensed under the [Apache License 2.0](LICENSE). Third-party components remain under their own licenses.
