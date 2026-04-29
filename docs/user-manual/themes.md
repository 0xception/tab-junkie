# Themes

Tab Junkie ships with 14 color themes inspired by popular code-editor color schemes. The selected theme applies instantly across all surfaces — side panel, new tab page, standalone window, settings page, quick-search popup, and group-jump popup.

---

## Changing your theme

1. Open [Settings](settings.md) (gear icon, Alt+Comma, or the "Open Settings" button in the quick-search popup).
2. Scroll to the **Theme** section.
3. Select a theme from the dropdown.

The change applies within ~500 ms. No page reload or extension restart is required.

---

## Available themes

### System Default

Follows your operating system's dark/light preference automatically. If you switch your OS between light and dark mode, Tab Junkie updates to match within one browser session.

### Dark themes

| Theme | Character |
|-------|-----------|
| **Dracula** | Purple-tinted dark background with vivid pink, cyan, and green accents. One of the most popular code-editor dark themes. |
| **Nord** | Cool blue-grey tones inspired by Arctic landscapes. Low contrast, easy on the eyes for extended use. |
| **One Dark** | Atom editor's signature neutral dark palette. Balanced contrast with muted gold and teal accents. |
| **Monokai** | High-contrast dark with orange, green, and pink highlights. A classic from the Sublime Text era. |
| **Tomorrow Night** | Muted dark background with warm amber/tan accents. Comfortable for long sessions. |
| **Atom One Dark** | The true Atom One Dark palette — subtle and consistent, slightly warmer than Nord. |
| **Solarized Dark** | Warm amber text on a deep teal-tinted dark base. The original Solarized dark mode by Ethan Schoonover. |
| **GitHub Dark** | GitHub's official dark mode. Familiar if you spend time reading code or issues on GitHub. |
| **Tokyo Night** | Neon-accented cool dark inspired by the lights of Tokyo at night. The newest addition to the catalog. |

### Light themes

| Theme | Character |
|-------|-----------|
| **Tomorrow** | Soft light complement to Tomorrow Night. Clean and minimal with subtle blue-grey tones. |
| **Atom One Light** | Atom editor's light palette. Warmer than GitHub Light; comfortable for daytime use. |
| **Solarized Light** | Classic Solarized light — warm cream background with carefully calibrated contrast. |
| **GitHub Light** | GitHub's official light mode. Clean white-on-grey with blue accents. |

---

## Theme accessibility limitations

Tab Junkie verifies WCAG AA contrast (4.5:1 minimum) on group-header tints across all 14 themes and all 9 group-color slots. Most themes pass on every slot. One theme cannot reach the AA threshold on any slot — no tint adjustment or palette change can fix it without breaking the theme's canonical look:

### Solarized Dark

Solarized Dark's canonical base-text / base-background pair (`#839496` on `#073642`) measures **4.111:1** — already below the 4.5:1 AA floor before any group-color tint is applied. Because the base contrast is below AA at the source, no tint amount or slot-color adjustment can lift the tinted group headers to 4.5:1 (the theoretical maximum reachable contrast at any tint is 4.446:1 — still a miss). Modifying the base text or background colors would break the canonical Solarized Dark identity and is out of scope.

The measured contrast ratios for each group-color slot in Solarized Dark at the shipping 20% tint are:

| Group color slot | Measured contrast ratio |
|------------------|------------------------|
| blue | 3.484:1 |
| purple | 3.608:1 |
| teal | 3.199:1 |
| red | 3.582:1 |
| orange | 3.249:1 |
| pink | 3.540:1 |
| indigo | 3.684:1 |
| yellow | 3.012:1 |
| slate | 3.440:1 |

These values are enforced as monotonic-decrease floors in `tests/b117-gc-matrix-audit.test.js` — if a future change accidentally darkens a slot further, the test will catch it.

**If you need WCAG AA contrast on group headers**, use one of these themes — all meet 4.5:1 on every group-color slot: Solarized Light, GitHub Dark, Tomorrow Night, Nord, Monokai, or Tokyo Night.

---

## First-time setup note

After updating Tab Junkie to v1.26.0 (which introduced the theme system), please disable and re-enable the extension at `edge://extensions` (or `chrome://extensions`). This flushes the service worker module cache and ensures the theme validator loads the full 14-slug enum. Without this step you may see "Could not save" errors when selecting a theme.

---

## Rollback note

If you downgrade to a version of Tab Junkie before v1.26.0, any non-legacy theme slug stored on disk (e.g., `'dracula'`) will be rejected by the older validator and silently replaced with the System Default. No bookmark data is affected — only your theme preference resets.
