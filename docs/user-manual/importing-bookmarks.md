# Importing Bookmarks

Tab Junkie can import bookmarks from a standard **Netscape-format HTML file** — the file you get when you export bookmarks out of Chrome, Edge, Firefox, Safari, or almost any bookmark manager. The import runs entirely in your browser; no data is sent anywhere.

> **Heads up — this is destructive.** Import **replaces** every group and bookmark already in Tab Junkie. There is no automatic backup and no undo. If you have data you want to keep, **Export HTML or Export JSON first** (see [Exporting Your Bookmarks](./exporting-data.md)).

---

## Where to find the button

The **Import HTML** button sits in the side panel header, alongside **Export HTML** and **Export JSON**. The icon is an up-arrow over a horizontal line.

---

## How to import

1. Click **Import HTML** in the side panel header.
2. Pick a `.html` or `.htm` file in the file picker. The filename that browsers typically produce looks like `bookmarks_2026_04_19.html`.
3. A preview dialog opens titled **Replace all bookmarks?** and shows:
   - how many bookmarks will be imported,
   - how many folders will be imported,
   - the filename you picked,
   - (when applicable) how many malformed entries will be skipped,
   - (when applicable) how many duplicate URLs will be skipped,
   - a prominent warning: *"This will REPLACE all existing bookmarks and groups. Continue?"*
4. Click **Replace all** to commit. The default focus is on **Cancel** so an accidental Enter does nothing destructive. Cancel backs out of the import without touching your data.

The import is **atomic**: if the commit fails for any reason — quota exceeded, safe-mode, corrupted shape — your existing bookmarks remain exactly as they were.

---

## What gets imported

### Supported file format

Netscape Bookmark File Format 1. This is the de facto standard — Chrome, Edge, Firefox, Safari, and most bookmark managers all export it. You do not need to edit the file first.

### Folders become groups

Folders at the top level of the file become Tab Junkie groups. Folders nested one level inside a top-level folder become sub-groups.

Folders nested **three or more levels deep are flattened** so they still live under their original top-level group. Each deeper folder's name is joined with ` / ` to preserve the original path. For example:

```
Work
  Projects
    2026
      Tab Junkie
```

imports as:

- **Work** (top-level group)
- **Projects** (sub-group of Work)
- **Projects / 2026** (sub-group of Work)
- **Projects / 2026 / Tab Junkie** (sub-group of Work)

All the bookmarks at every depth still end up under **Work**, and the folder names are preserved in the sub-group names so you can re-organize later if you want.

### Loose bookmarks land in Ungrouped

Bookmarks that live at the very top of the HTML file — outside any folder — appear in the **Ungrouped** section in the side panel. Nothing is lost.

### Group colors are assigned automatically

Tab Junkie picks a color from its palette based on the folder name. The choice is deterministic — the same folder name always gets the same color — so re-importing the same file after edits keeps colors consistent.

### Timestamps

If the HTML file includes the standard `ADD_DATE` and `LAST_MODIFIED` attributes (most browsers set them), Tab Junkie preserves the original created and last-modified times on each bookmark. Otherwise the time of import is used.

### What is **not** imported

- **Favicons** — Tab Junkie does not read favicons from the HTML file. It re-captures them on first use once the tab is opened or becomes live.
- **Duplicate URLs within the file** — if the same URL appears more than once, only the first entry is kept. The preview dialog tells you how many duplicates will be skipped.
- **Unsafe URL schemes** — `javascript:` and `data:` URLs are skipped for safety. The following schemes are imported: `http://`, `https://`, `file://`, `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:`.

---

## File size limits

Import files up to **5 MiB** are accepted. Larger files are rejected before reading with an inline toast (`"File too large (max 5 MiB)"`). This matches the underlying Chrome storage quota — a file that's too big to store can't be imported.

If you have a very large bookmark collection, export it from your browser into smaller per-folder chunks, or trim the file first.

---

## Backups: please make one

Tab Junkie does **not** automatically back up your existing data before an import. The cautious workflow is always:

1. Click **Export HTML** (or **Export JSON**) to save a copy of your current data.
2. Only then click **Import HTML** to bring in the new file.

If the import turns out to be wrong for you, the only way back is to import your exported backup. Keeping a fresh export on disk takes seconds and is worth it every time.

---

## Privacy

Like everything else in Tab Junkie, import is entirely local. The file is read by your browser, parsed in the extension, and committed to your local storage. No part of the file is transmitted, logged, or shared with any service.
