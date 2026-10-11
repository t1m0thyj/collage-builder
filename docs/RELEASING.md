# Releasing

Collage Builder uses semantic versions. Before version 1.0, minor releases may include breaking project-format or workflow changes; document any migration in the changelog.

## Release checklist

1. Choose the version and update `package.json`, `bun.lock`, and `CHANGELOG.md`.
2. Run `bun install --frozen-lockfile` and `bun run verify`.
3. Install Playwright browsers with `bun x --bun playwright install --with-deps`, then run `bun run test:e2e` and `bun run test:offline`.
4. Run `bun audit --prod` and review any production finding before release.
5. Complete the relevant manual checks in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), including browser, accessibility, save/recovery, and export checks.
6. Confirm the distribution includes `LICENSE.txt`, generated `THIRD_PARTY_NOTICES.md`, and the generated `licenses/` directory.
7. Merge the green commit to `main`, tag it as `vX.Y.Z`, and create a GitHub release from the matching changelog entry.

Pushes to `main` deploy the verified static build to GitHub Pages after all CI browser jobs pass. This package is private to npm and is not published to the npm registry.

## HEIC decoder licensing

The generated third-party notice discovers npm packages, but `heic-to` embeds libheif and libde265 WebAssembly rather than declaring them as separate packages. Before distributing a release with HEIC/HEIF support, review the exact bundled versions and LGPL requirements. Include the complete LGPL-3.0 and GPL-3.0 texts, preserve copyright notices, provide corresponding source and rebuild/relink instructions, and ensure the distribution terms allow debugging modifications to the LGPL components. Consult qualified legal counsel for release or patent questions.
