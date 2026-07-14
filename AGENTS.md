# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable product decisions

- React + TypeScript Chrome MV3 extension, new-tab override, local-first and no Google sign-in requirement.
- Chrome native bookmarks are the content source of truth. Per-folder and per-bookmark presentation metadata is stored in a compact, portable title suffix; page theme, background, brand, and global layout preferences remain local and can be exported.
- Default view shows all bookmarks recursively and supports collapsible nested folders.
- Editing is hidden by default. One unified edit mode handles page layout and native bookmark organization; right-click menus are not part of the interaction model.
- Top search is a web search/address field, defaulting to Google.
- Visual priority: modern lightweight interface with optional glassmorphism, background images, paper and night themes.
- The default homepage visual source of truth is the light Xiangzi Folio reference: cream-to-mint ambient background, translucent white surfaces, violet accent, compact top search bar, understated root tabs, and spacious rounded folder cards. Avoid dense dark dashboard styling as the default.
- Folder components may use directory, icon grid, mixed, dock, compact stack, or focus layouts.
- The homepage has no bookmark-root tab strip. All Chrome bookmark roots are presented together. The full-width quick-access row is sourced from a real Chrome bookmark folder named “常用入口”; on first native run it is seeded with ChatGPT, Claude, Gemini, YouTube, and Bilibili.
- Icon-style bookmark grids use 16 columns. Individual icon bookmarks can choose their own column span, with 2 columns as the default.
- Bookmark widths use the page's 12-column coordinate system even when rendered inside a component. A default bookmark occupies 4 page columns: three fit inside a 12-column parent, while only one fits inside a 4-column parent. Saved child widths are clamped to the parent component width.
- A collapsed nested folder behaves like a compact tag and occupies 4 page columns by default. When expanded, it returns to its configured/content width and the parent grid reflows. This compact rule does not override top-level component widths.
- Top-level components use measured masonry row spans. When one component expands vertically, following collapsed components densely fill free space beneath shorter neighbors instead of waiting below the tallest item in the row.
- The default homepage content scope is the Chrome bookmark bar only. “Other bookmarks” and “Mobile bookmarks” are hidden from both direct-bookmark aggregation and folder cards unless the user explicitly enables secondary roots in edit mode.
- Preserve the original glass, paper, and night bookmark themes. Also provide three optional geek themes—Terminal Aurora, Orbital Workbench, and Circuit Studio—with distinct built-in backgrounds; a user-uploaded background image always takes priority and remains local.
- Geek themes should use the localhost:3010 reference's soft photographic glassmorphism: a blurred cinematic background, blue-gray tint, low-contrast translucent cards, very subtle borders, small radii, and light typography. Avoid neon outlines, terminal monospace styling, flat navy canvases, and high-contrast dashboard panels.
- In geek themes, the top region must not be enclosed by one full-width surface. The logo, search field, status, and edit action float directly on the wallpaper; only the search and individual controls retain their own compact translucent surfaces.
- Use about 40px desktop page gutters. The normal top-right edit entry is icon-only with an accessible label. Geek-theme search fields use a compact 48px control height without changing the top region's vertical position.
- Orbital Workbench is the user's current preferred geek theme and should receive the primary polish pass: preserve its cinematic wallpaper and blue-gray photographic glass, while improving legibility, compactness, and hierarchy rather than converting it into the light default theme.
- Orbital Workbench remains the default theme, with a 10% background shade by default to protect text contrast over its cinematic wallpaper.
- In edit mode, the top-left brand name, tagline, and logo are directly editable; logo assets remain local and can be replaced or removed.
- The selected search engine is persisted locally and its picker closes when focus moves outside it. Chrome connection status is shown only while editing, and the default edit entry is an icon-only pencil button.
- Default folder presentation is directory style at 4 page columns for first-level folders; nested folders default to icon-grid style. Explicit presentation settings encoded in bookmark titles take precedence over the local cache.
- Icon-grid bookmarks default to 1.5-column sizing and support half-column sizing through portable title metadata.
- Portable presentation metadata uses exactly three ASCII characters at the end of a Chrome bookmark title: `~` plus two Base64URL characters. The 12-bit word contains a collision-free mixed-radix payload, node type, format version, and checksum. Folder payloads uniquely cover 7 styles × 7 width states × 2 collapsed states; bookmark payloads uniquely cover 5 styles × 9 width states × 2 row states. Enum order is a persisted data contract and must not be reordered.
- The extension directly owns Chrome's new-tab page through Manifest V3 `chrome_url_overrides.newtab`; users do not need New Tab Redirect or another redirect extension.
- Optional recent-click sorting only moves a bookmark to the front when it is outside the first five items among its siblings; bookmarks already in that range keep their order.
- In edit mode, dragging a bookmark directly onto another bookmark means “insert at this position.” Freeze bookmark hitboxes at drag start, then use the pointer's physical slot against those frozen hitboxes so visual reflow never changes drop targeting. Show one non-interactive, equal-width “放到这里” slot before the target so later bookmarks visibly move back one position. Dragging onto a folder header or card shows a full-card “放到这里 · 移入…” overlay and moves the bookmark into that folder rather than treating it as folder reordering.
