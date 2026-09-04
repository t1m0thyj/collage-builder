# Offline use and self-hosting

Collage Builder supports offline use without being an installable PWA. The first production visit downloads and caches the complete application bundle, including features that are loaded on demand. Project documents and imported images remain in the browser's local storage as before.

After the service worker finishes activating, later visits and reloads can start without a network connection. A first-ever visit still requires a connection, and clearing the site's browser data removes both cached application files and locally saved recovery data.

## Self-hosting

Run `npm ci` and `npm run build`, then serve the complete `dist` directory from a static web server. The directory is the self-contained distribution; the application has no runtime server dependency.

Service workers require HTTPS in production. Browsers also allow them on `localhost` for development. Configure the server to serve `service-worker.js` from the deployment root, and preferably make that file revalidate on every visit so application updates are discovered promptly.

For a subdirectory deployment, provide its public path when building. For example:

```powershell
$env:BASE_PATH = '/collage-builder/'
npm run build
```

The base path must begin and end with `/`. Deploy every file in `dist`; filenames and the generated service worker are content-revisioned together, so mixing files from separate builds can prevent offline setup.

No web app manifest is generated, and the application does not request installation.
