import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { contrastRatio, getLuminance } from "./color";
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
});
const builder = new XMLBuilder(
    {
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        // Otherwise `aria-hidden="true"` is written as a bare `aria-hidden`, which is invalid XML.
        suppressBooleanAttributes: false,
    }
);

const SVG_SOURCE = /<svg[\s>][\s\S]*?<\/svg>/.source;
const DATA_URI_SOURCE = /data:image\/svg\+xml((?:;[\w.+-]+(?:=[\w.+-]+)?)*),/.source;
// Larger data URIs are skipped to keep the editor responsive.
const MAX_DATA_URI_LENGTH = 500_000;

/** An SVG found in text: `index`/`length` cover the source span, `code` is the SVG markup. */
export type SvgMatch = { index: number, length: number, code: string }

// Returns a fresh regex each call so no `lastIndex` state is shared between callers.
const findSvgTags = (text: string): SvgMatch[] => {
    const reg = new RegExp(SVG_SOURCE, 'gi');
    const matches: SvgMatch[] = [];
    let match;
    while ((match = reg.exec(text))) {
        matches.push({ index: match.index, length: match[0].length, code: match[0] });
    }
    return matches;
}

// Finds where a data URI ends: at the matching quote or `)` it started after,
// otherwise at whitespace. Backslash-escaped characters (JS/CSS strings) are skipped.
const findDataUriEnd = (text: string, start: number, bodyStart: number) => {
    const opener = text[start - 1];
    const closer = opener === '"' || opener === "'" || opener === '`' ? opener : opener === '(' ? ')' : undefined;
    let depth = 0;
    let i = bodyStart;
    for (; i < text.length && i - start < MAX_DATA_URI_LENGTH; i++) {
        const char = text[i];
        if (char === '\\') {
            i++;
        } else if (closer === ')' && char === '(') {
            // Unquoted url(…) may contain e.g. transform='rotate(45)'.
            depth++;
        } else if (closer === ')' && char === ')' && depth > 0) {
            depth--;
        } else if (closer ? char === closer : /[\s"'`()]/.test(char)) {
            return i;
        }
    }
    return closer ? -1 : i;
}

const decodeDataUri = (params: string, body: string) => {
    try {
        if (/;base64/i.test(params)) {
            return Buffer.from(body.replace(/\\\r?\n|\s/g, ''), 'base64').toString('utf8');
        }
        // Undo string escapes (`\"`, `\'`, line continuations), then URL encoding.
        const unescaped = body.replace(/\\\r?\n/g, '').replace(/\\(.)/g, '$1');
        if (!/%[0-9a-f]{2}/i.test(unescaped)) {
            return unescaped;
        }
        try {
            return decodeURIComponent(unescaped);
        } catch {
            // A stray `%` makes decodeURIComponent throw; decode the valid escapes one by one.
            return unescaped.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        }
    } catch {
        return undefined;
    }
}

// SVG data URIs, e.g. url("data:image/svg+xml,%3Csvg…") or 'data:image/svg+xml;base64,…'.
const findSvgDataUris = (text: string): SvgMatch[] => {
    const reg = new RegExp(DATA_URI_SOURCE, 'gi');
    const matches: SvgMatch[] = [];
    let match;
    while ((match = reg.exec(text))) {
        const bodyStart = match.index + match[0].length;
        const end = findDataUriEnd(text, match.index, bodyStart);
        if (end <= bodyStart) {
            continue;
        }
        const code = decodeDataUri(match[1], text.slice(bodyStart, end))?.trim();
        if (code && /^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(code)) {
            matches.push({ index: match.index, length: end - match.index, code: code.slice(code.search(/<svg[\s>]/i)) });
        }
        reg.lastIndex = end;
    }
    return matches;
}

/** All SVGs in the text: `<svg>` tags and SVG data URIs, in document order. */
export const findSvgs = (text: string): SvgMatch[] => {
    const dataUris = findSvgDataUris(text);
    // A plain-text data URI also contains an `<svg>` tag; keep only the data URI match.
    const tags = findSvgTags(text).filter(tag =>
        !dataUris.some(uri => tag.index >= uri.index && tag.index < uri.index + uri.length));
    return [...dataUris, ...tags].sort((a, b) => a.index - b.index);
}

export type PreviewColor = { color: string, applyToFill: boolean }

const isUnsetColor = (value: unknown) =>
    value === undefined || /^\s*(currentcolor|inherit)\s*$/i.test(String(value))

// SVG attributes that really are camelCase; every other camelCase name is JSX.
const CAMEL_CASE_SVG_ATTRS = new Set([
    'viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'patternUnits',
    'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
    'markerUnits', 'markerWidth', 'markerHeight', 'refX', 'refY', 'spreadMethod', 'stdDeviation',
    'baseFrequency', 'numOctaves', 'stitchTiles', 'filterUnits', 'primitiveUnits', 'pathLength',
    'textLength', 'lengthAdjust', 'startOffset', 'kernelMatrix', 'kernelUnitLength', 'tableValues',
    'surfaceScale', 'specularConstant', 'specularExponent', 'diffuseConstant', 'limitingConeAngle',
    'pointsAtX', 'pointsAtY', 'pointsAtZ', 'targetX', 'targetY', 'edgeMode', 'xChannelSelector',
    'yChannelSelector', 'keyPoints', 'keySplines', 'keyTimes', 'calcMode', 'attributeName',
    'repeatCount', 'repeatDur', 'requiredExtensions', 'systemLanguage', 'zoomAndPan',
]);

const JSX_ATTR_RENAMES: Record<string, string> = {
    className: 'class',
    htmlFor: 'for',
    xlinkHref: 'xlink:href',
    xmlnsXlink: 'xmlns:xlink',
    xmlSpace: 'xml:space',
};

const normalizeAttrName = (name: string) => {
    if (JSX_ATTR_RENAMES[name]) {
        return JSX_ATTR_RENAMES[name];
    }
    if (CAMEL_CASE_SVG_ATTRS.has(name) || !/[A-Z]/.test(name)) {
        return name;
    }
    return name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

// Strips JSX-only syntax the XML parser can't read: comments, spreads,
// `style={{…}}` and `attr={expr}`. Literal expressions are kept as values.
const stripJsx = (code: string) => code
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\{\s*\.\.\.[^{}]*\}/g, '')
    .replace(/\s[\w:-]+=\{\{[^{}]*\}\}/g, '')
    .replace(/(\s[\w:-]+)=\{\s*([^{}]*?)\s*\}/g, (_, attr: string, expr: string) => {
        const literal = /^(?:(-?\d+(?:\.\d+)?)|"([^"]*)"|'([^']*)'|`([^`$]*)`)$/.exec(expr);
        if (!literal) {
            return '';
        }
        const value = literal[1] ?? literal[2] ?? literal[3] ?? literal[4];
        return `${attr}="${value.replace(/"/g, '&quot;')}"`;
    });

// react-native-svg uses capitalized tags (`<Path>`, `<LinearGradient>`); SVG tags are case-sensitive.
const normalizeTagName = (name: string) =>
    name === 'TSpan' ? 'tspan' : name.charAt(0).toLowerCase() + name.slice(1)

// Renames JSX attributes and tags to their SVG names on every element, in place.
const normalizeNode = (node: unknown) => {
    if (Array.isArray(node)) {
        node.forEach(normalizeNode);
        return;
    }
    if (!node || typeof node !== 'object') {
        return;
    }
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        const isAttr = key.startsWith('@_');
        const renamed = isAttr
            ? `@_${normalizeAttrName(key.slice(2))}`
            : /^[A-Z]/.test(key) ? normalizeTagName(key) : key;
        let finalKey = key;
        if (renamed !== key && !(renamed in obj)) {
            obj[renamed] = obj[key];
            delete obj[key];
            finalKey = renamed;
        }
        if (!isAttr) {
            normalizeNode(obj[finalKey]);
        }
    }
}

const toNumber = (value: unknown) => {
    const n = parseFloat(String(value));
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

export type SvgImage = {
    base64: string
    originalSize: { height?: string, width?: string }
    /** Rendered size in px, when a size was requested. */
    renderedSize?: { height: number, width: number }
}

export type SvgImageOptions = {
    /** Size in px of the box the image is fitted into. */
    size?: number
    /** Keep the SVG's aspect ratio instead of rendering a size × size square. */
    keepAspectRatio?: boolean
    previewColor?: PreviewColor
    /**
     * `checkerboard` or any CSS color, drawn behind the SVG with a little padding.
     * `auto` picks one only when the SVG's colors are hard to see on the `theme`.
     */
    background?: string
    /** Theme the image is shown on; used by `background: 'auto'`. */
    theme?: 'dark' | 'light'
}

const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'text', 'tspan', 'textPath']);

type Paint = { fill?: string, stroke?: string, color: string }

// Collects the colors shapes actually render with, following fill/stroke/color inheritance.
const collectColors = (root: Record<string, any>) => {
    const colors: string[] = [];
    const add = (value: string | undefined, color: string) => {
        const paint = value?.trim();
        if (!paint || /^(none|transparent)$/i.test(paint) || /^url\(/i.test(paint)) {
            return;
        }
        colors.push(/^currentcolor$/i.test(paint) ? color : paint);
    };
    const walk = (node: unknown, tag: string, inherited: Paint) => {
        if (Array.isArray(node)) {
            node.forEach(child => walk(child, tag, inherited));
            return;
        }
        if (!node || typeof node !== 'object') {
            return;
        }
        const obj = node as Record<string, unknown>;
        const style: Record<string, string> = {};
        if (typeof obj['@_style'] === 'string') {
            for (const [, prop, value] of obj['@_style'].matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) {
                style[prop.toLowerCase()] = value;
            }
        }
        const own = (prop: string) => {
            const value = style[prop] ?? obj[`@_${prop}`];
            return value === undefined || /^inherit$/i.test(String(value)) ? undefined : String(value);
        };
        const color = own('color');
        const paint: Paint = {
            fill: own('fill') ?? inherited.fill,
            stroke: own('stroke') ?? inherited.stroke,
            color: color && !/^currentcolor$/i.test(color) ? color : inherited.color,
        };
        if (SHAPE_TAGS.has(tag)) {
            // Shapes with no fill anywhere up the tree are filled black.
            add(paint.fill ?? '#000000', paint.color);
            add(paint.stroke, paint.color);
        }
        add(own('stop-color'), paint.color);
        for (const key of Object.keys(obj)) {
            // Shapes in clip paths and masks only shape other content, they aren't seen.
            if (!key.startsWith('@_') && !key.startsWith('#') && key !== 'clipPath' && key !== 'mask') {
                walk(obj[key], key, paint);
            }
        }
    };
    walk(root, 'svg', { color: '#000000' });
    return colors;
}

// Hover popup background luminance for dark (#252526) and light (#f3f3f3) themes.
const THEME_LUMINANCE = { dark: 0.018, light: 0.896 };

/** Picks a background only when the SVG's colors are hard to see on the theme. */
const pickAutoBackground = (root: Record<string, any>, theme: 'dark' | 'light') => {
    const luminances = collectColors(root)
        .map(getLuminance)
        .filter((l): l is number => l !== undefined);
    const hidden = luminances.filter(l => contrastRatio(l, THEME_LUMINANCE[theme]) < 2);
    if (!hidden.length) {
        return undefined;
    }
    if (hidden.length < luminances.length) {
        return 'checkerboard';
    }
    return theme === 'dark' ? '#f3f3f3' : '#1f1f1f';
}

// Reads the width/height ratio from the viewBox, falling back to width/height.
const getAspectRatio = (root: Record<string, any>) => {
    const viewBox = String(root['@_viewBox'] ?? '').trim().split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
        return viewBox[2] / viewBox[3];
    }
    const width = toNumber(root['@_width']);
    const height = toNumber(root['@_height']);
    return width && height ? width / height : 1;
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Nests the SVG inside a padded outer SVG that paints the background first.
const wrapWithBackground = (innerSvg: string, width: number, height: number, padding: number, background: string) => {
    const outerWidth = width + padding * 2;
    const outerHeight = height + padding * 2;
    let backdrop: string;
    if (background === 'checkerboard') {
        const cell = Math.max(4, Math.round(Math.max(outerWidth, outerHeight) / 8));
        // Mid-gray tones so both black and white icons stay visible.
        backdrop = `<defs><pattern id="__isp_checker" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">`
            + `<rect width="${cell * 2}" height="${cell * 2}" fill="#8c8c8c"/>`
            + `<rect width="${cell}" height="${cell}" fill="#737373"/><rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#737373"/>`
            + `</pattern></defs><rect width="100%" height="100%" rx="3" fill="url(#__isp_checker)"/>`;
    } else {
        backdrop = `<rect width="100%" height="100%" rx="3" fill="${escapeAttr(background)}"/>`;
    }
    const inner = innerSvg.replace(/^<svg\b/, `<svg x="${padding}" y="${padding}"`);
    return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${outerWidth}" height="${outerHeight}" viewBox="0 0 ${outerWidth} ${outerHeight}">${backdrop}${inner}</svg>`,
        width: outerWidth,
        height: outerHeight,
    };
}

/**
 * Turns SVG source (plain or JSX) into a data URI.
 * Returns undefined when the code can't be parsed as an SVG.
 */
export const svg2Base64 = (code: string, options: SvgImageOptions = {}): SvgImage | undefined => {
    const { size, keepAspectRatio, previewColor, theme = 'dark' } = options;
    let { background } = options;
    let svgObj: Record<string, any>;
    try {
        svgObj = parser.parse(stripJsx(code));
    } catch {
        return undefined;
    }
    // The regex is case-insensitive, so the root may be `svg`, `Svg` or `SVG`.
    const rootKey = Object.keys(svgObj).find(key => key.toLowerCase() === 'svg');
    const root = rootKey && svgObj[rootKey];
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
        return undefined;
    }
    if (rootKey !== 'svg') {
        svgObj = { svg: root };
    }
    normalizeNode(root);
    // JSX usually omits these, but an SVG image won't render without them.
    if (root['@_xmlns'] === undefined) {
        root['@_xmlns'] = 'http://www.w3.org/2000/svg';
    }
    if (root['@_xmlns:xlink'] === undefined && JSON.stringify(root).includes('"@_xlink:')) {
        root['@_xmlns:xlink'] = 'http://www.w3.org/1999/xlink';
    }

    const originalSize = { height: root['@_height'], width: root['@_width'] };
    if (previewColor) {
        // An SVG rendered as an image has no inherited color, so currentColor and
        // the default fill both resolve to black unless set on the root element.
        // color="currentColor" or "inherit" on the root has nothing to inherit from either.
        if (isUnsetColor(root['@_color'])) {
            root['@_color'] = previewColor.color;
        }
        if (previewColor.applyToFill && isUnsetColor(root['@_fill'])) {
            root['@_fill'] = previewColor.color;
        }
    }
    // Runs after the preview color is applied, so it sees the colors that will render.
    if (background === 'auto') {
        background = pickAutoBackground(root, theme);
    }
    let renderedSize: SvgImage['renderedSize'];
    // The background's padding fits inside the requested size.
    const padding = background && size ? Math.max(2, Math.round(size * 0.08)) : 0;
    if (size) {
        const box = Math.max(1, size - padding * 2);
        const ratio = keepAspectRatio ? getAspectRatio(root) : 1;
        // Without a viewBox, shrinking width/height would crop instead of scale.
        const width = toNumber(originalSize.width);
        const height = toNumber(originalSize.height);
        if (root['@_viewBox'] === undefined && width && height) {
            root['@_viewBox'] = `0 0 ${width} ${height}`;
        }
        renderedSize = ratio >= 1
            ? { width: box, height: Math.max(1, Math.round(box / ratio)) }
            : { width: Math.max(1, Math.round(box * ratio)), height: box };
        root['@_width'] = renderedSize.width;
        root['@_height'] = renderedSize.height;
        // CSS sizes in `style` would override the width/height attributes.
        if (typeof root['@_style'] === 'string') {
            const style = root['@_style'].replace(/(?:^|;)\s*(?:min-|max-)?(?:width|height)\s*:[^;]*/gi, '').replace(/^\s*;\s*/, '').trim();
            if (style) {
                root['@_style'] = style;
            } else {
                delete root['@_style'];
            }
        }
    }

    let svg: string;
    try {
        svg = builder.build(svgObj);
    } catch {
        return undefined;
    }
    if (background && renderedSize) {
        const wrapped = wrapWithBackground(svg, renderedSize.width, renderedSize.height, padding, background);
        svg = wrapped.svg;
        renderedSize = { width: wrapped.width, height: wrapped.height };
    }
    return {
        base64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        originalSize,
        renderedSize,
    };
}

export const removeEscape = (str: string) => {
    return str.replace(/\\t|\\s|\\n|\\/g, '')
}
