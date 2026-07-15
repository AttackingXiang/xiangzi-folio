# Design QA — 15-theme visual system

## Comparison targets

- Source visual truth:
  - `artifacts/theme-redesign-2026-07-15/01-cinematic-layered-glass.png`
  - `artifacts/theme-redesign-2026-07-15/02-editorial-ambient-shelf.png`
  - `artifacts/theme-redesign-2026-07-15/03-spatial-focus-mosaic.png`
- Browser-rendered implementation:
  - `artifacts/theme-redesign-2026-07-15/qa/orbital-viewport-pass-2.jpg`
  - `artifacts/theme-redesign-2026-07-15/qa/glass-viewport-pass-1.jpg`
  - `artifacts/theme-redesign-2026-07-15/qa/dusk-viewport-pass-1.jpg`
  - `artifacts/theme-redesign-2026-07-15/qa/theme-settings-pass-1.jpg`
  - `artifacts/theme-redesign-2026-07-15/qa/mobile-orbital-pass-1.jpg`
- Desktop viewport: 1440 × 1024, browsing mode, demo Chrome-bookmark tree, no uploaded background.
- Mobile viewport: 390 × 844, browsing mode, Orbital Workbench, no uploaded background.

## Full-view comparison evidence

Each of the three source images was opened in the same comparison input as its matching browser screenshot. The implementation preserves the sources' floating top bar, five-item quick-access shelf, three-column masonry hierarchy, translucent photographic surfaces, normalized favicon tiles, and compact folder typography. The theme system intentionally shares component anatomy while changing background art, palette, blur, shade, radius, and surface tokens.

Focused region comparison was not required: the 1440 × 1024 full-view captures render the logo, search controls, 13–14 px labels, favicon treatment, borders, spacing, and nested-folder anatomy clearly enough for direct inspection. The settings panel was captured separately because it is a distinct interaction state.

## Required fidelity surfaces

- Fonts and typography: consistent system sans-serif fallback, restrained weight hierarchy, readable 13–14 px bookmark labels, compact secondary text, no unintended wrapping or truncation in the tested desktop state.
- Spacing and layout rhythm: approximately 40 px desktop gutters, stable five-card quick row, three-column masonry, compact 48 px search control, consistent card padding and vertical rhythm.
- Colors and tokens: all themes use the shared semantic token layer. Orbital, Glass, and Dusk match their blue-gray, cream/mint, and blue-violet source directions; interactive accents retain sufficient contrast.
- Image quality and asset fidelity: three generated raster backgrounds use the correct cinematic/paper/architectural subjects, fill the viewport without stretching, and remain sharp at 1440 × 1024. No source imagery was replaced with CSS drawings or handcrafted SVG art.
- Copy and content: theme names, audience descriptions, background-storage explanation, and edit-mode labels are coherent in standalone use. The removed hero slogan does not reappear.
- Icons and controls: Phosphor icons remain consistent in stroke family and optical size. The edit entry is icon-only with an accessible label; settings and theme buttons are semantic controls.
- Responsiveness and accessibility: 390 px viewport reports `scrollWidth === innerWidth === 390`; quick access uses an internal horizontal shelf, while the page itself does not overflow. Buttons retain accessible names and the settings surface is a labeled dialog.

## Findings and comparison history

### Iteration 1

- [P2] Orbital surfaces were darker than the cinematic source.
  - Evidence: `orbital-viewport-pass-1.jpg` reduced separation between the wallpaper and folder/quick surfaces compared with source 01.
  - Fix: raised Orbital surface, folder, quick-access, favicon, and border luminosity while preserving the 10% default shade.
  - Post-fix evidence: `orbital-viewport-pass-2.jpg`; the hierarchy now matches the source's soft blue-gray glass and remains legible over the car workshop image.
- [P2] Folder drop-ready styling inherited the progressive hidden state.
  - Evidence: the base drop zone collapsed border, margin, and opacity; the ready selector restored height and color only.
  - Fix: the ready state now restores `border-width`, `margin-top`, and `opacity` in addition to height and color.
  - Post-fix evidence: build and interaction regression suite pass; the visible drop-ready state is no longer suppressed.

### Iteration 2

- No actionable P0/P1/P2 visual differences remain across the three selected theme directions.
- [P3] On mobile, the quick-access shelf intentionally exposes part of the next card. This is accepted as a horizontal-scroll affordance and does not cause document overflow.

## Primary interactions tested

- Enter edit mode and verify editing-only status/actions.
- Open the Appearance dialog.
- Confirm all 15 theme choices are present.
- Switch Glass → Dusk → Orbital and verify the rendered theme changes.
- Close the dialog and exit edit mode.
- Verify desktop and mobile layout states.
- Check browser console warnings and errors: none.

## Implementation checklist

- [x] Three selected visual directions implemented as independent themes.
- [x] Fifteen curated presets implemented through one maintainable token system.
- [x] Orbital remains the default with 10% background shade.
- [x] User-uploaded local background keeps priority.
- [x] Progressive edit controls and drop-ready visibility are intact.
- [x] Desktop, mobile, settings, interactions, console, tests, and production build checked.

final result: passed
