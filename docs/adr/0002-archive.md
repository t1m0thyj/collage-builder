# ADR 0002: Project file formats

Portable projects use self-contained `.collage` ZIP archives. Original supported image bytes are embedded and archive paths are generated from asset IDs.

Linked projects use plain `.collage.json` documents. They contain validated relative paths and asset hashes but no image bytes. A user-selected root directory resolves those paths when saving or opening the project.

The two containers are intentionally strict: `.collage` archives contain embedded asset metadata only, and `.collage.json` documents contain linked asset metadata only.

Status: accepted and implemented.
