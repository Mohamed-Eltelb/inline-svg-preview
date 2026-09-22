# Inline SVG Preview

Inline SVG Preview is a plugin that can preview svg code in your file, such as jsx/tsx, html, vue, and svg. There is a thumbnail before your svg tag to preview the svg, and you can hover on your svg code to view the svg in popover.

JSX is supported: attributes like `strokeWidth` and `className` are converted, `{...props}` and non-literal `{expressions}` are ignored, and react-native-svg tags (`<Svg>`, `<Path>`) work too.

## Preview inline

![s1](https://cdn.jsdelivr.net/gh/a1245582339/image-hosting@master/s1.3xt6eo1800k0.gif)

Previews show in every file you open, whether or not it's in the workspace.

|  Key   | Type  |  Example   | Default  
|  ----  | ----  | ----  | ----  
| "inlineSvgPreview.gallery.include"  | `null` \| `string[]` | `["src/**/icon.tsx"]` | `null` (files the gallery shows)
| "inlineSvgPreview.gallery.exclude"  | `null` \| `string[]` | `["src/legacy"]` | `null` (files the gallery leaves out)
| "inlineSvgPreview.currentColor"  | `string` | `"#ffffff"` | `"auto"` (light on dark themes, dark on light themes; `""` disables)
| "inlineSvgPreview.applyColorToFill"  | `boolean` | `false` | `true` (also use the color as the default fill)
| "inlineSvgPreview.inlineSize"  | `null` \| `number` | `18` | `null` (editor font size)
| "inlineSvgPreview.hoverSize"  | `number` | `120` | `50`
| "inlineSvgPreview.hoverBackground"  | `string` | `"checkerboard"` | `"none"` (also `"contrast"` or any CSS color)

## SVG Gallery

**You must set `inlineSvgPreview.gallery.include` or `inlineSvgPreview.gallery.exclude` to choose which files the gallery shows.** These are glob patterns relative to the workspace folder, and an `exclude` entry like `src/legacy` leaves out that whole folder. They only affect the gallery, not inline previews. Setting `include` is recommended, since with only `exclude` the gallery scans every file in the workspace (except `node_modules`).


![s2](https://cdn.jsdelivr.net/gh/a1245582339/image-hosting@master/s2.22wcrjjhoctc.gif)

Run the **SVG Gallery** command (`inlineSvgPreview.gallery`) to show all svgs in your included files. Click an svg to open the file and jump to its code. The gallery refreshes when you save an included file, or with the Refresh button.

_If you manage your svg code as separate `.svg` files and want to see them all in a gallery, Inline SVG Preview is not your best choice. I would recommend you to use [SVG Gallery](https://marketplace.visualstudio.com/items?itemName=developer2006.svg-gallery)_