# ADR 0001: Keep rendering separate from saved projects

Status: accepted and implemented.

Saved projects use a JSON-safe domain model for pages, layouts, photos, and styles. Konva nodes and other live canvas objects stay in the browser and are never written into a project file.

Keeping rendering separate lets the editor and export code work from the same project data without tying the file format to Konva.
