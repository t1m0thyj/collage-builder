# Releasing

Collage Builder uses semantic version numbers. Before version 1.0, a minor release may change the project format or editing workflow. Explain any breaking changes and how to update existing projects in the changelog.

## Prepare a release

1. Choose the version and update `package.json`, `bun.lock`, and `CHANGELOG.md`.
2. Run `bun install --frozen-lockfile` and `bun run verify`.
3. Install Playwright's browsers with `bun x --bun playwright install --with-deps`, then run `bun run test:e2e` and `bun run test:offline`.
4. Run `bun audit --prod` and review any reported issues in dependencies shipped with the app.
5. Work through the [release checklist](RELEASE_CHECKLIST.md), including manual browser, accessibility, save/recovery, and export checks.
6. Check that the build includes `LICENSE.txt`, `THIRD_PARTY_NOTICES.md`, and the `licenses/` directory. Complete the HEIC decoder review below.
7. Merge the commit to `main` after CI passes, tag it as `vX.Y.Z`, and create a GitHub release using the matching changelog entry.

Pushes to `main` deploy the built app to GitHub Pages after all CI browser jobs pass. The npm package is marked private and isn't published to the npm registry.

## Review the HEIC decoder licenses

The build generates third-party notices from npm package metadata. The `heic-to` package also includes libheif and libde265 as WebAssembly code, so those components need a separate review.

Before distributing a release with HEIC/HEIF support:

- Check the exact bundled versions and their LGPL requirements.
- Include the complete LGPL-3.0 and GPL-3.0 license texts and preserve copyright notices.
- Provide the corresponding source and instructions for rebuilding and relinking the components.
- Make sure the distribution terms allow debugging modifications to the LGPL components.

Consult qualified legal counsel for release or patent questions.
