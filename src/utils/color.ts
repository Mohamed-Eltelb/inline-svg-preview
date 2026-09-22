const NAMED_COLORS: Record<string, string> = {
    white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', lime: '#00ff00',
    blue: '#0000ff', navy: '#000080', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
    pink: '#ffc0cb', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000',
    teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff',
    olive: '#808000', brown: '#a52a2a', gold: '#ffd700', tomato: '#ff6347', crimson: '#dc143c',
    indigo: '#4b0082', violet: '#ee82ee', coral: '#ff7f50', salmon: '#fa8072', tan: '#d2b48c',
    darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
    dimgray: '#696969', dimgrey: '#696969', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc',
}

/**
 * Relative luminance (0 = black, 1 = white) of a CSS color, for hex, rgb()/rgba()
 * and common named colors. Undefined for anything else (gradients, `none`, unknown names).
 */
export const getLuminance = (color: string): number | undefined => {
    const value = NAMED_COLORS[color.trim().toLowerCase()] ?? color.trim()
    let rgb: number[] | undefined
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
    if (hex) {
        const digits = hex[1].length <= 4 ? [...hex[1]].map(d => d + d).join('') : hex[1]
        rgb = [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16))
    }
    const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value)
    if (fn) {
        rgb = fn.slice(1, 4).map(Number)
    }
    if (!rgb) {
        return undefined
    }
    const [r, g, b] = rgb.map(c => {
        const s = Math.min(255, c) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastRatio = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
