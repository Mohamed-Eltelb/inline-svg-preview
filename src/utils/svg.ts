import { XMLParser, XMLBuilder } from "fast-xml-parser";
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
});
const builder = new XMLBuilder(
    {
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
    }
);
export const SVGReg = /<svg(S*?)[^>]*>[\s\S]*?<\/svg>/ig;

export type PreviewColor = { color: string, applyToFill: boolean }

const isUnsetColor = (value: unknown) =>
    value === undefined || /^\s*(currentcolor|inherit)\s*$/i.test(String(value))

export const svg2Base64 = (code: string, size?: {height: number, width: number}, previewColor?: PreviewColor) => {
    let svg = code
    const svgObj = parser.parse(code);
    const originalSize = { height: svgObj.svg['@_height'], width: svgObj.svg['@_width'] }
    if (size) {
        svgObj.svg['@_width'] = size.width
        svgObj.svg['@_height'] = size.height
    }
    if (previewColor) {
        // An SVG rendered as an image has no inherited color, so currentColor and
        // the default fill both resolve to black unless set on the root element.
        // color="currentColor" or "inherit" on the root has nothing to inherit from either.
        if (isUnsetColor(svgObj.svg['@_color'])) {
            svgObj.svg['@_color'] = previewColor.color
        }
        if (previewColor.applyToFill && isUnsetColor(svgObj.svg['@_fill'])) {
            svgObj.svg['@_fill'] = previewColor.color
        }
    }
    if (size || previewColor) {
        svg = builder.build(svgObj)
    }
    const base64 = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    return {
        base64,
        originalSize
    }
}

export const removeEscape = (str: string) => {
    return str.replace(/\\t|\\s|\\n|\\/g, '')
}