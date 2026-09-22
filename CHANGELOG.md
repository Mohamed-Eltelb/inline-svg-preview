# Change Log

All notable changes to the "inline-svg-preview" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- `inlineSvgPreview.currentColor` and `inlineSvgPreview.applyColorToFill` settings, so `currentColor` icons are visible on dark themes.
- JSX support: camelCase attributes, `className`, literal `{expressions}`, and react-native-svg tags.
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
