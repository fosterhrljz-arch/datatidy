# DataTidy interface audit and design rationale

This document records the original visual audit. Subsequent functional refinements on November 12, 2026 retain this design system while replacing batch-wide rules with independent file rules, adding search and import retries, separating New/Continue Batch, and correcting report actions. Current usage and verification details are in [README.md](../README.md).

## Method

Audited the existing, runnable DataTidy 1.0.0 before changing its UI. Used the bundled sample files, an offline Chromium session at 1536 × 1024, computed CSS contrast measurements, keyboard interaction checks, and source inspection. Baseline evidence: [screenshot](audit-before.png), [measurements](audit-before.json). The Numbers and Finder analysis below uses Apple's official documentation and illustrated guides, not a native macOS usability session (the development machine runs Windows).

## Specific problems found before implementation

| Area | Evidence | User impact | Intended correction |
| --- | --- | --- | --- |
| Readability | Rule descriptions: 11px, 2.81:1 contrast. Table legend: 9px, 2.60:1. File metadata: 10px, 2.48:1. Header description: 3.67:1. | Important qualifications and provenance are hard to read. | Shared type and semantic color tokens; secondary text at least 4.5:1 on its actual surface. |
| Keyboard navigation | A 10-row preview has 61 Tab stops; Arrow Right does not move to another cell. | Reaching controls beyond the table is tedious. | One table entry point, arrow navigation, Home/End, explicit keyboard help, visible selection, and Tab to leave. |
| Workflow predictability | With a valid preview, Back to Configure → Locate missing values switches to Review. | An inspection action unexpectedly changes the workflow stage. | Keep the current workspace stage; use Review when navigating from Reports. |
| Inspector hierarchy | Selected cell details, batch rules, sheet issues, and preview summaries stack in one scrolling pane. | Scope is unclear and selecting a cell pushes useful controls down. | Progressive disclosure: sheet issues or batch rules, with a dedicated selected-cell inspector and a clear return action. |
| Context | Batch rules and batch footer totals appear beside counts for one worksheet with weak scope labels. | Users may mistake worksheet issue counts for batch totals. | Explicit batch/worksheet labels, stable file and worksheet context, original row references. |
| Feedback | Notifications overlay the workspace. Export success remains after changing the export scope. | Messages obstruct controls; an old filename can imply that the newly selected file was downloaded. | In-flow feedback and export success tied to the current scope. |
| Focus and semantics | No skip link or route focus management; table headers lack scope/caption. Compare labels omit the proposed value. | Keyboard and assistive technology users lose context or miss changes. | Main-content shortcut, heading focus after page/stage changes, table semantics, complete cell descriptions. |
| Target size | Remove control measures 22 × 25px. | Precise pointing is required near file selection. | Consistent 32px desktop controls and 44px coarse-pointer targets. |
| Consistency | Many individual font sizes, gray values, and control dimensions. | Visual importance and interaction states vary between pages. | One shared token system and segmented-control component across all pages. |

## What Apple's patterns teach us

### Hierarchy and navigation

Apple's [Layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) emphasizes alignment, meaningful grouping, progressive disclosure, and adaptation to text and window size. [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) distinguish navigation from content and allow the content area to expand. DataTidy retains four named destinations and a separate, collapsible two-level file/worksheet navigator. Changing destinations preserves the session.

Finder's [sidebar and toolbar guide](https://support.apple.com/en-euro/guide/mac-help/mchl83c9e8b8/27/mac/27) separates location selection from document operations. Its [status and path guidance](https://support.apple.com/en-euro/guide/mac-help/mchlp1774/27/mac/27) makes the current location and selection understandable. DataTidy adapts that logic with file → worksheet → original-row context, scoped counts, reversible session removal, and fixed workflow actions. It does not imitate Finder's filesystem operations.

### Contextual inspection

In [Numbers](https://support.apple.com/en-ca/guide/numbers/tan089795ddb/mac), the inspector follows the selected object and exposes relevant controls. It can be hidden to free the canvas. [Cell selection](https://support.apple.com/en-mide/guide/numbers/tan8355845e5/mac) distinguishes selection from editing and makes full values inspectable. DataTidy follows selection with original and proposed values, issue explanations, and provenance. The table remains read-only; selecting a cell never mutates data.

Numbers' [keyboard shortcuts](https://support.apple.com/en-eg/guide/numbers/tana45192591/mac) support spatial cell navigation. DataTidy adopts arrows within the visible page, Home/End within a row, and Control/Command + Home/End within the page. Unlike a native spreadsheet editor, Tab leaves the read-only table rather than creating an editing loop. Original row buttons and duplicate references remain operable with arrows and Enter.

### Typography, controls, and accessibility

Apple's [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) guidance favors readable system typography, adequate contrast, adaptable text, keyboard access, and information conveyed through more than color. DataTidy uses locally available system fonts, a compact but readable scale, semantic text colors, clear focus rings, labeled issue/change markers, and reduced-motion support. Browser zoom and increased base text are tested. No remote fonts are introduced.

Apple's [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) guidance separates navigation, content controls, and the primary action. DataTidy groups view and inspection controls above the table and keeps one next-step action at the trailing edge of the workflow footer. Descriptive button text is retained because the workflow must be clear to first-time users across platforms.

## Design contract

- Preserve the processing engine, format support, local worker, conservative default rules, and source-file integrity.
- Use neutral surfaces with a small amount of semantic issue/change color, always supplemented by text or symbols.
- Use shared color, typography, spacing, radius, and control-size tokens. Body text is 14px at the default browser setting; secondary text is at least 12px. Relative text units support user scaling.
- Keep import/configure/review/export visible, preserve state between pages, and invalidate exports after any relevant change.
- Keep the main action visible; allow independent table and inspector scrolling. Reduce or stack peripheral panes when space is constrained.
- Use shared segmented controls with arrow-key selection. Keyboard shortcuts never change source data.
- Do not reproduce macOS window chrome, proprietary assets, glass effects, editing behavior, or decorative dashboards. These do not help the data-cleaning task.

## Verification

The existing React components were refined in place. The parsing, analysis, cleaning, and export engine in `src/core.mjs` was not changed (SHA-256 `910e9d63feed7592ba5ee3a4938d09452f0c61c72cf3ca23241d3107f7a30314`).

| Measured behavior | Before | After |
| --- | --- | --- |
| Rule description | 11px; 2.81:1 contrast | 12px; 5.90:1 |
| Table legend | 9px; 2.60:1 | 12px; 6.05:1 |
| Selected-file metadata | 10px; 2.48:1 | 12px; 5.04:1 |
| Header description | 3.67:1 | 6.05:1 |
| File removal target | 22 × 25px | 32 × 32px; 44px for coarse pointers |
| Table Tab stops, 10 sample rows | 61 | 1, with spatial arrow navigation |
| Locate issue while configuring a valid preview | Unexpected switch to Review | Remains in Configure |

Final evidence: [measured results](audit-after.json), [issue inspection](audit-after.png), [cell details](11-cell-details.png), [200% text](12-large-text.png), [compact zoom-equivalent viewport](13-zoom-layout.png), and [forced colors](14-high-contrast.png). The table can scroll in both axes; at narrow widths or increased text sizes, secondary panes stack and the main action remains visible. On short windows, the surrounding workspace also scrolls so the table does not collapse to zero height.

`tests/design-system.mjs` verifies keyboard entry/exit, arrows, Home/End, focus return, destination focus, segmented controls, accessible comparison text, contrast samples, stage stability, enlarged text, responsive data visibility, reduced motion, and forced-color rendering. These checks supplement the complete offline workflow in `tests/ui.mjs`, including actual downloads and export-scope reset, plus the 16 original engine tests. The suite checks that no HTTP request occurs. Screen-reader behavior has not been manually tested with VoiceOver or NVDA; the checks are not a claim of complete WCAG conformance.

### Visual review against the existing design references

This refinement retains the established generated workspace and Home composition. A new concept image was unnecessary for these audit-driven changes within the existing system.

1. Hierarchy: the same four destinations and guided steps remain, with stronger provenance and scope labels.
2. Layout: the file/table/inspector relationship remains; selection details now replace unrelated inspector content.
3. Type: shared relative sizes replace individually chosen small captions; supporting text is still subordinate without being faint.
4. Controls: white selected segments distinguish view selection from the black primary workflow action. Focus and selection also have visible outlines or edge markers.
5. Content and behavior: actual source rows, truthful export state, issue symbols, and real counts determine the interface. No generated data or macOS decoration is added.

Release verification: all 16 processing tests passed. The full workflow and real ZIP, JSON, and individual-file downloads passed in installed Chrome and Edge with networking disabled and zero console errors. Independent openpyxl checks confirmed exact exported sample rows, headers, column structure, worksheet names, text trimming, and numeric cell type. The design regression also verified 44px file-removal targets under touch emulation.
