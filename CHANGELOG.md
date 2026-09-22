# Change Log

All notable changes to the "inline-svg-preview" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Hover actions: copy the SVG (JSX converted to SVG), copy it as a data URI or CSS `url()`, or select its code.
- `inlineSvgPreview.previewPosition` setting: `gutter` shows the preview icon next to the line numbers instead of before the SVG code.
- `inlineSvgPreview.currentColor` and `inlineSvgPreview.applyColorToFill` settings, so `currentColor` icons are visible on dark themes.
- `inlineSvgPreview.inlineSize` and `inlineSvgPreview.hoverSize` settings (hover was fixed at 50px).
- `inlineSvgPreview.hoverBackground` setting: `auto` (default) adds a background only when the SVG's colors are hard to see on the theme; also `none`, `checkerboard`, or any CSS color.
- JSX support: camelCase attributes, `className`, literal `{expressions}`, and react-native-svg tags.
- Previews for SVG data URIs (URL-encoded, plain, and base64), e.g. `url("data:image/svg+xml,%3Csvg…")` in CSS or JS strings.
- Gallery Refresh button; the gallery also refreshes on save, theme change, and settings change.

### Changed
- Renamed from "Svg Preview In Code". The settings prefix is now `inlineSvgPreview.` (was `spic.`) and the gallery command is `inlineSvgPreview.gallery`.
- The extension is now bundled with esbuild, and the gallery no longer uses React: the package went from 6.6 MB to about 23 KB.
- Requires VS Code 1.74 or newer.

### Fixed
- One unparseable SVG no longer removes every preview in the file.
- SVGs without a `viewBox` are scaled instead of cropped.
- Gallery file filters are now `inlineSvgPreview.gallery.include` / `inlineSvgPreview.gallery.exclude` and only affect the gallery; inline previews show in every file, including files outside the workspace.
- File matching no longer scans the workspace on every change, and works in every workspace folder.
- `<svgfoo>`-like tags are no longer matched as SVGs.
- Missing `xmlns`/`xmlns:xlink` no longer stops an SVG from rendering.
