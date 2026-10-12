# User guide

[Open Collage Builder](https://t1m0thyj.github.io/collage-builder/) to get started. You can make a collage without installing anything or creating an account, and your photos stay on your device.

## Make your first collage

The welcome screen offers **Add photos** to start a new collage or **Open project** to continue one you've saved. You can bring this screen back anytime with the question-mark button in the top bar.

1. **Add your photos.** Choose **Add photos**, or drag photo files from your device into the editor. You'll find them in the **Images** panel on the left.
2. **Choose a layout.** Open **Layouts**, pick a photo count, and select an arrangement you like. Drag your photos from **Images** into the empty frames.
3. **Adjust the crop.** Double-click a photo, or select it and choose **Crop image**. Drag to reposition it and use the handles or zoom controls to get the framing right. Choose **Done** to keep your changes.
4. **Make it your own.** In the right-hand panel, adjust the outer margin, spacing between photos, rounded corners, background color, and shadows. The magic-wand button next to **Background** suggests a color from your photos.
5. **Download your collage.** Choose **Export…** and select PNG or JPEG.

Want to explore before adding your own photos? Download the [sample collage linked in the README](../README.md) and use **Open** to try it.

Use a desktop or tablet with a browser window at least 768 pixels wide. In a narrower window, the three-line menu button at the top left opens the **Layouts** and **Images** panels.

You can add JPEG, PNG, WebP, HEIC, and HEIF photos. HEIC/HEIF photos are converted so the browser can display them; their originals are kept in saved projects.

## Add more pages

Use the **+** beside the page tabs at the bottom to add a page. Each page can have its own layout, photos, and appearance.

Click a tab to switch pages. The arrow on the active tab opens options to rename, duplicate, reorder, clear, or delete that page. You can also drag tabs to reorder them or right-click a tab to open its options.

## Save your work for later

**Save** keeps an editable project. **Export…** downloads finished images you can share.

When saving a project, you can choose between two formats:

- **`.collage` — photos included.** This keeps the collage and its original photos in one file. It's the easiest option for moving your work to another device or keeping a backup.
- **`.collage.json` — photos kept separately.** This smaller file remembers where your photos are. Keep the original photo folder with it; if photos move or go missing, the app will help you find them again.

Depending on your browser, you'll either choose a file location or download the project. Some browsers call the photo-folder selection “Upload folder,” but nothing is uploaded.

To continue editing, choose **Open** and select your project file. After saving once, use **Save As…** from the arrow beside **Save** to make another copy or change formats.

## Export one page or several

Choose **Export…** for the current page. The arrow beside it lets you export all pages or a page range. Multiple pages download together in a ZIP file.

You can choose the image size and, for JPEG, the quality. PNG supports a transparent background; JPEG fills transparent areas with white. If the chosen size would enlarge your photos enough to look soft, the app shows a warning.

For multiple pages, you can customize filenames with `{title}` for the page name and `{number}` for its page number. For example, `Birds-{number}` gives you names such as `Birds-01.png` and `Birds-02.png`.

## Pick up where you left off

The app automatically keeps up to five recent drafts in this browser, with a total size limit of 2 GB. Older drafts are removed as needed.

When you return, choose **Continue this collage** to reopen a draft, **Start a new collage** to keep it for later, or **See saved drafts** to browse your copies. You can also click the save-status indicator in the top bar to manage local recovery copies and browser storage.

Use **Save** for anything you want to keep. Drafts belong to this browser on this device, and clearing the site's browser data removes them.

## Work without an internet connection

Open the app while you're online and leave it open until the offline icon appears in the top bar. Hover over it to check that it says **App available offline**. Your browser has now downloaded the files it needs to open the app without a connection.

Later, you can open the same address in the same browser while offline. If you clear the site's browser data, you'll need to visit again while online to set this up. See [offline use](OFFLINE.md) for more details.

## Keyboard shortcuts

Use `Ctrl` on Windows/Linux and `Cmd` on macOS where both are listed.

| Shortcut                                  | Action                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| `Ctrl/Cmd+S`                              | Save your project                                      |
| `Ctrl/Cmd+Shift+S`                        | Save a new copy or change formats                      |
| `Ctrl/Cmd+Z`                              | Undo                                                   |
| `Ctrl+Y` or `Ctrl/Cmd+Shift+Z`            | Redo                                                   |
| Arrow keys                                | Move a selected crop or adjust a focused divider       |
| `Page Up` / `Page Down`                   | Move a focused divider in larger steps                 |
| `Home` / `End`                            | Move a focused divider to its minimum or maximum       |
| `Enter`                                   | Start cropping a selected photo; accept an active crop |
| `Delete` / `Backspace`                    | Remove the photo from the selected frame               |
| `Escape`                                  | Cancel the current interaction or clear the selection  |
| `Ctrl/Cmd` + mouse wheel over the collage | Zoom the canvas                                        |
| `Alt` + mouse wheel while cropping        | Zoom the photo inside its frame                        |

Use `Tab` and `Shift+Tab` to move between buttons and fields. Keyboard controls for cropping and dividers appear near the canvas when available. The canvas zoom menu also offers presets and a custom percentage.

If something isn't working as expected, see [Help and feedback](../SUPPORT.md).
