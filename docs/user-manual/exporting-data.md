# Exporting Your Bookmarks

Tab Junkie can export your entire bookmark collection in two formats: **HTML** (for importing into another browser) and **JSON** (for a round-trip-safe backup). Both exports run entirely in your browser — no data is sent anywhere.

---

## Where to find the buttons

Both actions live in the side panel header, next to the other top-level controls:

- **Export HTML** — produces a `.html` file in the standard Netscape bookmark format.
- **Export JSON** — produces a `.json` file with a schema-versioned backup of your data.

Clicking either button triggers an immediate browser download. There is no intermediate dialog — the file lands in your default Downloads folder (or wherever you have configured your browser to save downloads).

---

## Export HTML — for importing into another browser

### What you get

A single `.html` file that follows the widely supported Netscape bookmark format. Every group becomes a folder, every bookmark becomes a link, and the folder structure mirrors the hierarchy you see in the side panel.

Items whose group has been deleted (orphans) are emitted under an **Ungrouped** folder so nothing is lost during export.

### Where it imports

The exported file has been round-trip tested with Chrome's bookmark importer and should also import cleanly into Firefox, Safari, Edge, and any other browser that accepts Netscape-format HTML bookmarks.

Most browsers have an import flow similar to:

1. Open the bookmark manager (for Chrome: **Menu → Bookmarks → Bookmark manager**).
2. Choose **Import bookmarks** from its menu.
3. Select **Bookmarks HTML file** and pick the file Tab Junkie produced.

### Safety notes

- All titles and URLs in the exported HTML are escaped so that titles containing `<`, `>`, `"`, or `&` characters cannot inject markup into the output.
- The file contains only your bookmark data — no cookies, no tab session state, no preferences.

### Performance

Exporting a collection of 1,000 items completes in under half a second on typical hardware.

---

## Export JSON — for backups

### What you get

A single `.json` file containing:

- `schemaVersion: 1` — locks the file shape so future versions can import it reliably.
- `exportedAt` — the timestamp of the export.
- Every group with its color, name, parent, and sort order.
- Every item with its title, URL, group assignment, and metadata.
- Optionally, your preferences (theme, sort order, and similar side-panel settings).

The output is **deterministic**: running two exports back-to-back produces files that are byte-identical except for the `exportedAt` timestamp. This makes the file safe to diff, check into a private repo, or store across multiple backups without bloat.

### When to use it

- Before you experiment with destructive actions (bulk delete, group restructuring).
- Before updating or reinstalling your browser.
- As a periodic snapshot you keep in your own storage.

### Import?

The JSON format is the reserved contract for a future **Import JSON** feature that will restore a backup into an empty or existing Tab Junkie install. For now, the JSON export is a one-way backup — if you need to move data between installs today, use **Export HTML** and import it via the browser's built-in bookmark importer.

---

## Privacy

Both exports are entirely local. Tab Junkie makes no network requests during export — the file is assembled in your browser and handed to your browser's download system. No part of your bookmark collection is transmitted, logged, or shared with any service.
