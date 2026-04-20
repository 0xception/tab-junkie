# UAT — B-007 Sub-group Nesting (depth = 1)

**Sprint**: 20 · **Tier**: Full (M) · **Status**: DEFERRED — executed as part of Sprint 20+ UAT burndown.

Load the unpacked extension (repo root) in Edge → Extensions → Developer Mode → Load Unpacked. Open the sidepanel. Walk each case below; record PASS / FAIL / WARN / SKIP with a short note.

| # | Case | Expected | Result | Notes |
|---|------|----------|--------|-------|
| U1 | Open the group dialog in CREATE mode (via the empty-state "Create group" CTA or the `+ Group` header button). | Dialog opens with a **Parent group** field between Color and Save/Cancel. Default option is "Top-level (no parent)". | | |
| U2 | With only top-level groups present, open the parent select. | All top-level groups appear as options in sortOrder. No nested group appears. | | |
| U3 | Create a new group WITH a parent selected (pick an existing top-level group). | Group is created and renders indented under its parent in the list. | | |
| U4 | Create a new group without selecting a parent (leave "Top-level"). | Group is created at the top level (no indentation). | | |
| U5 | Open the edit dialog for an existing **top-level** group. | Parent select pre-selects "Top-level". | | |
| U6 | Open the edit dialog for an existing **nested** group. | Parent select pre-selects the current parent's name. | | |
| U7 | Edit a top-level group and change parent to another top-level group. | Group moves under the new parent (indented in list). | | |
| U8 | Edit a nested group and change parent to "Top-level". | Group moves back to the top level (no indentation). | | |
| U9 | In edit mode, open the parent select on a group that has children. | Every other group is listed **except** (a) this group itself and (b) groups that already have their own children. | | |
| U10 | Try to nest a group that has children by editing its parent (via direct API call — UI pre-filter should prevent this path; if reached, storage rejects). | Inline error appears: "Can't nest this group — groups can only be one level deep." Dialog stays open. | | |
| U11 | Delete a parent group that has children. | Backend cascade moves children to top-level; re-render shows them as top-level (no longer indented). | | |
| U12 | Delete a nested group. | Only that group is removed; its parent and siblings are unaffected. | | |
| U13 | Edit a group's parent to itself via a race (two windows open; delete the selected parent from window A, submit the patch from window B). | Inline error appears: "Selected parent group no longer exists. Close this dialog and try again." | | |
| U14 | Keyboard: Tab through the dialog. | Focus order is Name → Color swatches → Parent select → Cancel → Save. | | |
| U15 | Keyboard: Escape key inside the dialog. | Dialog closes without dispatching any message. | | |
| U16 | Accessibility: hover each `.group-section--child` section. | Visual indentation is consistent in both light and dark themes. No colour regression. | | |
| U17 | Empty state: zero top-level groups available as parents (all have children already). | Parent select shows ONLY "Top-level (no parent)". | | |
| U18 | Collapse / expand on a parent group. | Parent's child groups collapse with it (nested inside the parent's items container). | | |

**Pass criterion**: every U1–U18 result is PASS or SKIP (with documented reason).

**Defects**: file any FAIL result as a new backlog item or append to the current sprint's findings slice (`docs/findings/sprint-NN.md`).
