# ADR 0002: Project file formats

Status: accepted and implemented.

A `.collage` project is a ZIP archive containing the document and original photo bytes. Photo paths inside the archive are generated from asset IDs, so the file can be moved without losing its photos.

A `.collage.json` project contains the document, relative photo paths, and hashes, but no photo bytes. The user chooses the original photo folder when saving or opening it.

Each format accepts only its own storage metadata: embedded assets in `.collage`, linked assets in `.collage.json`. This keeps opening and validation predictable.
