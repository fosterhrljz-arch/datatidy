# DataTidy interface specification

Reference: concept.png. Generated using the built-in Image Gen tool for design reference only; no raster assets are required at runtime.

Prompt: Complete desktop primary screen for an offline batch data cleaner. Apple-inspired white main canvas and neutral gray 240px sidebar; black text and primary action; generous whitespace; import strip, file navigation, paginated data table, Original/Compare/Cleaned controls, unchecked cleaning rules, and export action. No decorative graphics, gradients, dashboards, or card grids.

Tokens: canvas #ffffff; sidebar #f6f6f6; ink #171717; secondary #737373; border #e4e4e4; selection #e9e9e9. Pale amber #fff6da marks issues, pale green #eaf3ec marks explicit edits. 8–12px radii; system font stack; 32px headline, 20px section title, 13px controls. Lucide outline icons, 18px / 1.7 stroke.

Layout: fixed 230px left rail, fluid main with 36px padding. Header and import strip, preview with 10-row pagination, rules, action footer. Reports reuse table and typography. Under 900px the sidebar becomes a compact top region; data tables scroll horizontally without clipping controls. Empty state offers file selection and bundled sample data. No changes are preselected.

Required functional extensions: sheet selector, issue filters, import encoding/separator, error notifications, confirmation dialog listing proposed removals before export, visible Excel protection notices, and downloadable report.
