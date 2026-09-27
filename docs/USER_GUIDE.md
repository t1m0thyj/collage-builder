# User guide

## Create a collage

The first visit opens a quick start with direct actions to import images or open an existing
project. Use **Show quick start** in the top bar to open it again later.

1. Add images with **Import images** or drag supported files into the editor.
2. Add a page, choose a layout, and drag images into empty frames.
3. Select a frame to adjust its crop. Use the page controls to change padding, gaps, corner radius, color, and shadow.
4. Add or duplicate pages as needed.
5. Use **Export** to download the current page, all pages, or a page range as PNG or JPEG.

JPEG, PNG, WebP, HEIC, and HEIF imports are supported. HEIC/HEIF files are converted for editing while their originals remain untouched in saved projects.

## Save and reopen projects

- `.collage` embeds image data and is the easiest format to move or archive.
- `.collage.json` links to image files and is smaller, but those files must remain available. If a link breaks, the editor asks you to locate the image again.

Use **Save As** to choose the format. In browsers without native file-system access, saves use the browser's download flow.

## Recovery and offline use

The editor keeps up to five recent recovery saves in this browser. When the app finds one at
startup, you can restore it, start blank while retaining it, or review all local copies. Recovery
data is a safety net, not a replacement for saving a project file. Clearing site data removes
recovery saves.

After one complete production visit, the app can reload offline. See [Offline use and self-hosting](OFFLINE.md) for details.

## Keyboard use

- `Ctrl/Cmd+S`: save
- `Ctrl/Cmd+Shift+S`: save as
- `Ctrl/Cmd+Z`: undo
- `Ctrl+Y` or `Ctrl/Cmd+Shift+Z`: redo
- Arrow keys: move a selected crop or adjust a focused divider
- `Page Up` / `Page Down`: adjust a focused divider by a larger step
- `Home` / `End`: move a focused divider to its minimum or maximum
- `Enter`: open crop controls for a selected image frame
- `Delete` or `Backspace`: clear the selected frame
- `Escape`: cancel the current interaction or clear selection
- `Ctrl/Cmd` + mouse wheel over the canvas: zoom the canvas; use the zoom menu for presets or a custom percentage
- `Alt` + mouse wheel while cropping: zoom the photo inside its frame

Visible buttons and fields are reachable with `Tab` and `Shift+Tab`. Keyboard divider and crop controls appear near the canvas when the selected layout or frame supports them.
