# Inline SVG Preview

Inline SVG Preview is a plugin that can preview svg code in your file, such as jsx/tsx, html, vue, and svg. There is a thumbnail before your svg tag to preview the svg, and you can hover on your svg code to view the svg in popover.

SVG data URIs are previewed too, in CSS, JS or anywhere else: URL-encoded (`url("data:image/svg+xml,%3Csvg…")`), plain (`data:image/svg+xml;utf8,<svg…>`) and base64 (`data:image/svg+xml;base64,…`).

JSX is supported: attributes like `strokeWidth` and `className` are converted, `{...props}` and non-literal `{expressions}` are ignored, and react-native-svg tags (`<Svg>`, `<Path>`) work too.

## Preview inline

The hover also has actions: **SVG** copies the markup (JSX is converted to plain SVG), **Data URI** and **CSS** copy it ready for `<img src>` or `url(…)`, and **Select** selects the SVG code.

![extension](https://github.com/user-attachments/assets/9349ba06-1290-4d2e-86af-f300450a3f3c)

Previews show in every file you open, whether or not it's in the workspace. Set `inlineSvgPreview.previewPosition` to `"gutter"` to show the icon next to the line numbers instead, so your code isn't pushed sideways.

|  Key   | Type  |  Example   | Default  
|  ----  | ----  | ----  | ----  
| "inlineSvgPreview.gallery.include"  | `null` \| `string[]` | `["src/**/icon.tsx"]` | `null` (files the gallery shows)
| "inlineSvgPreview.gallery.exclude"  | `null` \| `string[]` | `["src/legacy"]` | `null` (files the gallery leaves out)
| "inlineSvgPreview.currentColor"  | `string` | `"#ffffff"` | `"auto"` (light on dark themes, dark on light themes; `""` disables)
| "inlineSvgPreview.applyColorToFill"  | `boolean` | `false` | `true` (also use the color as the default fill)
| "inlineSvgPreview.previewPosition"  | `"inline"` \| `"gutter"` | `"gutter"` | `"inline"` (icon before the SVG code, or in the gutter)
| "inlineSvgPreview.inlineSize"  | `null` \| `number` | `18` | `null` (editor font size)
| "inlineSvgPreview.hoverSize"  | `number` | `120` | `50`
| "inlineSvgPreview.hoverBackground"  | `string` | `"checkerboard"` | `"auto"` (background only when the SVG is hard to see; also `"none"` or any CSS color)
| "inlineSvgPreview.hoverActions"  | `boolean` | `false` | `true` (copy/select links under the hover image)

## SVG Gallery

**You must set `inlineSvgPreview.gallery.include` or `inlineSvgPreview.gallery.exclude` to choose which files the gallery shows.** These are glob patterns relative to the workspace folder, and an `exclude` entry like `src/legacy` leaves out that whole folder. They only affect the gallery, not inline previews. Setting `include` is recommended, since with only `exclude` the gallery scans every file in the workspace (except `node_modules`).

![gallary](https://github.com/user-attachments/assets/3306a410-38d9-4537-b77b-921bf1bab1c7)

Run the **SVG Gallery** command (`inlineSvgPreview.gallery`) to show all svgs in your included files. Click an svg to open the file and jump to its code. The gallery refreshes when you save an included file, or with the Refresh button.
