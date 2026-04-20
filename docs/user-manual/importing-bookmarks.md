# Importing Bookmarks

Tab Junkie can import your data in two formats:

- **Import HTML** — a standard Netscape-format `.html` file from Chrome, Edge, Firefox, Safari, or almost any bookmark manager. Good for moving bookmarks between browsers.
- **Import JSON** — a Tab Junkie-native `.json` backup produced by **Export JSON**. Preserves groups, group colors, timestamps, and preferences exactly.

Both imports run entirely in your browser; no data is sent anywhere.

> **Heads up — both imports are destructive.** Import **replaces** every group and bookmark already in Tab Junkie. There is no automatic backup and no undo. If you have data you want to keep, **Export HTML or Export JSON first** (see [Exporting Your Bookmarks](./exporting-data.md)).

---

## Import HTML

### Where to find the button

The **Import HTML** button sits in the side panel header, alongside **Import JSON**, **Export HTML**, and **Export JSON**. The icon is an up-arrow over a horizontal line.

---

## How to import HTML

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

## Import JSON

Use **Import JSON** when you want to restore a Tab Junkie-native backup — the `.json` file produced by **Export JSON**. Unlike HTML, JSON is a **lossless round trip**: groups, group colors, timestamps, and your preferences (theme and similar) come back exactly as you exported them.

### When to use HTML vs. JSON

- **HTML** is a portable, browser-friendly format. Use it when you're moving bookmarks between Tab Junkie and another browser, or between browsers directly. You'll keep the titles, URLs, and folder structure — but not group colors, preferences, or exact timestamps unless the file includes them.
- **JSON** is the Tab Junkie backup format. Use it when you want to restore a Tab Junkie install to an exact earlier state, or to move a full Tab Junkie setup (groups, colors, preferences) between browsers or devices.

JSON files produced by other tools are **not** accepted — only files written by Tab Junkie's **Export JSON** action.

### Where to find the button

The **Import JSON** button sits in the side panel header, right next to **Import HTML**.

### How to import JSON

1. Click **Import JSON** in the side panel header.
2. Pick a `.json` file in the file picker. Non-JSON files are rejected with a clear error.
3. A preview dialog titled **Replace all bookmarks?** opens and shows:
   - the filename you picked,
   - how many bookmarks will be imported,
   - how many groups will be imported,
   - (when applicable) a short **repair summary** — see below,
   - the same prominent warning: *"This will REPLACE all existing bookmarks and groups. Continue?"*
4. Click **Replace all** to commit. The default focus is on **Cancel** so an accidental Enter does nothing destructive.

The import is **atomic**: if the commit fails for any reason — quota exceeded, safe-mode, corrupted shape — your existing data stays exactly as it was.

### Automatic repairs

JSON backups can occasionally contain structural defects — for example, a group that points to a parent that no longer exists, or two items that share the same internal ID. Tab Junkie's importer quietly repairs these kinds of problems before committing, and surfaces a short summary in the preview dialog so you know what happened. A repair summary might look like:

- *"2 groups had missing parents and were moved to the root."*
- *"1 circular group reference was broken."*
- *"3 duplicate IDs were re-minted."*
- *"4 items with no group were moved to Ungrouped."*

A clean backup shows no repair summary at all. When repairs are reported, no data is lost — the affected entries are simply moved somewhere sensible so the import can succeed.

### What gets imported

- **Groups** — every group with its original name, color, sort order, and parent relationship.
- **Bookmarks** — every item with its title, URL, group assignment, and original timestamps.
- **Preferences** — if the backup includes preferences (theme, sort order, and similar side-panel settings), they are applied on import. Preferences that are missing or unreadable fall back to the Tab Junkie defaults instead of rejecting the import.
- **URL schemes** — same as HTML import: `http`, `https`, `file`, `chrome`, `edge`, `chrome-extension`, `about`, and `view-source` are imported; `javascript:` and `data:` URLs are skipped for safety.
- **Duplicates** — if the same URL appears more than once in the backup, only the first entry is kept.

### Fresh internal IDs

Every imported bookmark and group gets a fresh Tab Junkie ID on import. The content you see — titles, URLs, group membership, timestamps, preferences — is preserved exactly across a round trip, but the internal identifiers change. This is intentional and protects against ID collisions across backups.

### Schema-version compatibility

JSON backups include a schema version.

- **Current version**: the backup imports as-is.
- **Newer version** (created by a future Tab Junkie release): the import is refused with the message *"Backup was created in a newer Tab Junkie version. Please update Tab Junkie first, then import."* Upgrade Tab Junkie, then try again.
- **Older version**: Tab Junkie will apply any registered migration steps and then import. No migration steps are registered in the current release, but the pipeline is in place for future compatibility.

### File size limits

JSON files up to **5 MiB** are accepted through the UI. Larger files are rejected upfront with an inline toast. The extension enforces a secondary 10 MiB hard cap in the background, so unusually large files never reach storage even through other code paths.

### Known limitation: preferences-only backups

A JSON file that contains **only** preferences — zero items and zero groups — is currently rejected with *"Backup contains no bookmarks."* If you want to restore just your preferences without touching bookmarks, edit the backup to include at least one item or group before importing, or leave feedback for a future release that restores preferences independently.

### Backups: please make one

Just like HTML import, **Import JSON** does not automatically back up your existing data. If you want an undo path, click **Export JSON** (or **Export HTML**) first, then run the import.

---

## Privacy

Like everything else in Tab Junkie, import is entirely local — for both HTML and JSON. The file is read by your browser, parsed in the extension, and committed to your local storage. No part of the file is transmitted, logged, or shared with any service. There is no telemetry.
