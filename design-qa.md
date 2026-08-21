# Design QA — Tool selector homepage

- Date: 2026-08-21
- Source reference: `/Users/fangkaikun/Documents/toolbox-website/tmp/pdfs/qa-tool-selector-dark-1.png`
- Desktop implementation: `/Users/fangkaikun/Documents/toolbox-website/kevin6-toolbox/implementation-home-desktop.png`
- Mobile implementation: `/Users/fangkaikun/Documents/toolbox-website/kevin6-toolbox/implementation-home-mobile.png`
- Page state: homepage, default `ALL` filter, empty search

## Normalization

The source reference is 2134 × 1334 px and represents a 1600 × 1000 CSS-pixel desktop composition at approximately 1.33375× raster density. The implementation capture is 1600 × 1000 px at a 1600 × 1000 CSS-pixel viewport. Comparison was therefore made by composition and CSS-pixel geometry rather than raw raster pixels.

## Full-view comparison

The source and implementation were inspected together in one comparison pass. The implementation preserves the intended dark grid background, asymmetric task/search introduction, three-column card grid, compact filter row, category-colored card accents and high-contrast icon tiles. It uses only the six implemented tools and does not introduce placeholder brands or tools.

## Focused checks

- Typography: display heading, supporting labels, card titles and descriptions retain a clear scanning hierarchy without clipping.
- Spacing and layout: desktop cards align to a three-column grid; the 390 × 844 mobile viewport resolves to one 346 px column with no horizontal overflow.
- Colors: image tools use acid green, transfer tools use blue, and the document tool uses orange across stripe, icon and action affordances.
- Icons: every card uses a consistent Phosphor outline icon; no hand-drawn SVG or placeholder imagery is used.
- States and interactions: `TRANSFER 02` returns only Pair Transfer and Group Transfer; searching `scan` returns only Document Scanner; the active filter exposes `aria-pressed`.
- Accessibility: search has an accessible label, filters are semantic buttons, cards are full-card links, focus styles are present, and mobile controls remain usable.
- Runtime: the inspected page produced no browser warnings or errors.

No focused crop was necessary because all desktop controls and all six cards were visible in the normalized full-view comparison; mobile responsiveness was checked separately with a dedicated viewport capture and DOM measurements.

## Findings and iteration history

Pass 1 found no P0, P1 or P2 fidelity defects. The visual system, information architecture, interactions and responsive behavior match the approved design direction. No corrective design iteration was required after the implementation capture.

Pass 2 reduced the hero title from `clamp(54px, 5.8vw, 82px)` to `clamp(52px, 5.3vw, 76px)`, with the mobile rule reduced from `clamp(48px, 15vw, 68px)` to `clamp(44px, 13.5vw, 62px)`. The updated 1600 × 1000 comparison keeps the title hierarchy while adding breathing room; the 390 px mobile check reports a 52.65 px title with no horizontal overflow. No browser warnings or errors were present.

Pass 3 reduced the title another half-step to `clamp(48px, 5vw, 72px)` and `clamp(42px, 12.8vw, 58px)` on mobile. The verified sizes are 72 px at 1600 px and 49.92 px at 390 px, with no horizontal overflow or browser warnings/errors.

## Final result

passed
