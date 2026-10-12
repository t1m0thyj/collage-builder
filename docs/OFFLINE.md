# Offline use and self-hosting

## Use the app offline

You can use Collage Builder without an internet connection once your browser has downloaded the app.

1. [Open Collage Builder](https://t1m0thyj.github.io/collage-builder/) while you're online.
2. Leave it open until the offline icon appears in the top bar. Hover over it to check that it says **App available offline**.
3. Next time, open the same address in the same browser, even if you're offline.

You don't need to install the app. Your browser keeps a copy of the app's files, including the tools for importing photos, opening projects, and exporting collages.

The first visit needs an internet connection. If the status says **Online only**, offline setup hasn't succeeded in that browser. Clearing the site's browser data removes the downloaded app files and your recovery drafts. Project files you've saved to your device are unaffected; visit again while online to restore offline access.

Your photos and projects stay on your device. See the [user guide](USER_GUIDE.md) for saving and reopening your work.

## Host your own copy

If you'd like to run Collage Builder on your own website, build it and serve the resulting files:

```sh
bun install --frozen-lockfile
bun run build
```

The `dist/` folder contains everything the website needs. Serve the whole folder from a static web server; you don't need an application server or database. See the [development guide](DEVELOPMENT.md) for setup requirements.

Use HTTPS so browsers can enable offline access. For local testing, browsers also allow offline access on `localhost`. Offline support runs in the built app; `bun run dev` does not enable it. To try a build locally, run `bun run build` followed by `bun run preview`.

Offline access uses a service worker, a browser feature that keeps the app's files available without a connection. Serve `service-worker.js` from the root of the app's public path, and configure it to check for a fresh copy on each visit so updates are found promptly.

### Host under a subdirectory

Set the public path when building. For example, to serve the app at `https://example.com/collage-builder/`, use:

```powershell
$env:BASE_PATH = '/collage-builder/'
bun run build
```

The path must begin and end with `/`. Deploy every file in `dist/` from the same build. The filenames and service worker are generated together; mixing files from different builds can prevent offline setup.

The build doesn't include a web app manifest or an installation prompt.
