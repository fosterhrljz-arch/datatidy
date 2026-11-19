# DataTidy 1.0.0 UI refactor

## Scope and invariants

The existing React application is reorganized, not replaced with a new processing system. Parsing, detection, rule semantics, exports, and supported formats remain in the original `src/core.mjs`.

Original and final engine SHA-256: `910e9d63feed7592ba5ee3a4938d09452f0c61c72cf3ca23241d3107f7a30314`.

`session.js` extracts existing worker RPC, downloads, and session actions into a shared hook. `Sidebar`, `Preview`, `RulesPanel`, `QualityReport`, and `ImportArea` are refactored into separate modules and composed by the workflow shell. Worker changes are limited to presentation queries (issue filtering, original-row location, paginated change logs) and reversible session file removal. The original engine test suite remains unchanged.

## References and concept prompts

- [Workspace concept](redesign-workspace.png): generated with the built-in Image Gen tool. Brief: a full Apple Numbers/Finder-inspired desktop screen, neutral global navigation, Import → Configure → Review → Export stepper, file and worksheet rail, interactive comparison table, contextual issue inspector, and anchored Back/Continue actions. All English; code-native controls; no decorative graphics.
- [Home concept](redesign-home.png): generated with the built-in Image Gen tool. Brief: the same sidebar and white canvas, “A little tidying. A lot more clarity.”, Start Cleaning / Try Sample Files, a clearly labeled explanatory table, and three short product descriptions. No runtime raster dependency.
- Apple HIG: [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars).

The generated Home concept accidentally included colored window buttons. They are excluded from implementation because this is an offline browser app, the requested palette is monochrome, and simulated operating-system controls would be misleading. The workspace reference determines the shared sidebar.

## Design system

White canvas `#fff`, neutral sidebar `#f5f5f6`, black ink `#1c1c1e`, separators `#e5e5e7`, and selected surfaces `#e7e7e9`. Pale amber is reserved for detected issues; pale green for explicit edits. System typography, 28px workspace heading, 54px Home heading, 13–14px primary controls/data, and smaller secondary metadata. Lucide icons use consistent 1.7px strokes. Buttons and segmented controls use 5–7px radii. No remote fonts or assets.

The desktop shell is bounded by the viewport. The toolbar, workflow heading, and footer remain fixed within that shell; table, file list, and inspector scroll independently. At compact desktop widths, the main rail becomes labeled-on-hover icons. On narrow screens it becomes top navigation, workspace panes stack, and only the content area scrolls. Main navigation retains accessible names at every width. Motion respects reduced-motion preferences.

## Visual review ledger

Reviewed the concepts and final browser screenshots with `view_image`, at the native reference size of 1536 × 1024. Also inspected 1280 × 720 and 390 × 844 screenshots.

| Comparison | Final treatment |
| --- | --- |
| Information hierarchy | Home, Data Cleaner, Reports, and Settings have distinct screens; files and worksheets have their own rail. |
| Workspace composition | File navigation, center table, and right inspector match the primary concept. Rails can collapse without discarding state. |
| Typography | Increased desktop data, file names, and inspector controls to 13px during review. Supporting metadata stays quieter. |
| Palette and borders | White/neutral surfaces, thin separators, black active segmented controls and primary actions; issue/edit colors have specific meanings. |
| Actions and spacing | Back/Next and download controls stay visible. An early mobile flex-sizing issue was fixed and visibility is asserted by browser tests. |
| Content | Headlines and navigation follow the concept. The table uses the actual imported schema and source-record references, not generated sample numbers. |
| Responsive behavior | Compact rails, stacked mobile panes, horizontally scrollable data, and preserved footer verified without page overflow. |

Functional refinements to the generated references: 10-row pagination retained from v1.0; original references begin at row 2 because row 1 is the header; full real sample columns include city; cell inspection, issue filters, import warnings, Undo, and export acknowledgements are explicit controls required by the task. Above-the-fold copy was checked against the concept and these functional requirements. There are no invented performance metrics, fake operating-system controls, remote assets, or unconnected primary actions.

## Verification

Browser plugin not available; Playwright used installed Chrome and Edge with the local `file:` application and network disabled. No remote server or browser instance containing user data was used. Browser downloads were verified outside the execution sandbox because the sandbox cancels even trivial local blob downloads.

Core checks: all 16 original engine tests pass, including 100,000 records, encodings, workbook integrity, and ZIP collisions. The UI suite asserts the original engine hash, follows Home → Import → Configure → Review → Export, and verifies navigation retention, issue/cell location, change-log links, undo, stale-preview blocking, acknowledgements, real downloads, malformed-file and encoding recovery, worksheet selection, compact/mobile layout, and zero HTTP requests or console errors. Exported Excel files were independently reopened with openpyxl.

No AgentGit operation, upload, commit, or publication was performed.

## HIG audit refinement

The subsequent audit and implemented design contract are documented in [docs/ui-audit.md](../docs/ui-audit.md). Shared tokens, white selected segments, stronger text contrast, spatial keyboard selection, stable workflow stages, contextual inspector disclosure, and in-flow feedback supersede the earlier styling details above. The existing composition and processing engine remain intact.
