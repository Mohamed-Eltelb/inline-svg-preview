import { XMLParser, XMLBuilder } from "fast-xml-parser";
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

export type SvgMatch = { index: number, code: string }

// Returns a fresh regex each call so no `lastIndex` state is shared between callers.
export const findSvgs = (text: string): SvgMatch[] => {
    const reg = new RegExp(SVG_SOURCE, 'gi');
    const matches: SvgMatch[] = [];
    let match;
    while ((match = reg.exec(text))) {
        matches.push({ index: match.index, code: match[0] });
    }
    return matches;
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
}

/**
 * Turns SVG source (plain or JSX) into a data URI.
 * Returns undefined when the code can't be parsed as an SVG.
 */
export const svg2Base64 = (code: string, size?: {height: number, width: number}, previewColor?: PreviewColor): SvgImage | undefined => {
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
    if (size) {
        // Without a viewBox, shrinking width/height would crop instead of scale.
        const width = toNumber(originalSize.width);
        const height = toNumber(originalSize.height);
        if (root['@_viewBox'] === undefined && width && height) {
            root['@_viewBox'] = `0 0 ${width} ${height}`;
        }
        root['@_width'] = size.width;
        root['@_height'] = size.height;
    }
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

    let svg: string;
    try {
        svg = builder.build(svgObj);
    } catch {
        return undefined;
    }
    return {
        base64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        originalSize,
    };
}

export const removeEscape = (str: string) => {
    return str.replace(/\\t|\\s|\\n|\\/g, '')
}
