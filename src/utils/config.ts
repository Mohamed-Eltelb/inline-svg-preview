import * as vscode from 'vscode';
import { PreviewColor } from './svg';

export const CONFIG_SECTION = 'inlineSvgPreview'

const getPatterns = (key: 'gallery.include' | 'gallery.exclude') => {
    const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string[] | null>(key)
    return Array.isArray(value) ? value.filter(pattern => typeof pattern === 'string' && pattern.trim()) : null
}

// An exclude entry like `src/icons` means the folder, so also match everything below it.
const expandExclude = (pattern: string) =>
    /\/\*\*$/.test(pattern) ? [pattern] : [pattern, `${pattern.replace(/\/$/, '')}/**`]

export type FileFilter = {
    include: string[] | null
    exclude: string[]
}

/** Returns null when neither `include` nor `exclude` is set. */
export const getFileFilter = (): FileFilter | null => {
    const include = getPatterns('gallery.include')
    const exclude = getPatterns('gallery.exclude')
    if (!include && !exclude) {
        return null
    }
    return { include, exclude: (exclude ?? []).flatMap(expandExclude) }
}

const matchesAny = (document: vscode.TextDocument, patterns: string[]) => {
    const folders = vscode.workspace.workspaceFolders ?? []
    return patterns.some(pattern => folders.some(folder =>
        vscode.languages.match({ pattern: new vscode.RelativePattern(folder, pattern) }, document) > 0
    ))
}

/** Whether this document is one of the files the gallery shows. */
export const isDocumentIncluded = (document: vscode.TextDocument, filter = getFileFilter()) => {
    if (!filter) {
        return true
    }
    if (filter.include && !matchesAny(document, filter.include)) {
        return false
    }
    return !matchesAny(document, filter.exclude)
}

/** Workspace files for the gallery. With only `exclude` set, every file is a candidate. */
export const findIncludedFiles = async (filter: FileFilter) => {
    const exclude = `{${['**/node_modules/**', ...filter.exclude].join(',')}}`
    const include = filter.include ?? ['**/*']
    const uris = (await Promise.all(include.map(pattern => vscode.workspace.findFiles(pattern, exclude, 5000)))).flat()
    const unique = new Map(uris.map(uri => [uri.toString(), uri]))
    return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path))
}

const NAMED_COLORS: Record<string, string> = {
    white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff',
    yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
}

// Whether a CSS color is light, for the hex, rgb() and a few named forms. Undefined if unknown.
const isLightColor = (color: string): boolean | undefined => {
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
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18
}

/** Inline icon size in px: the setting, or the editor font size when unset. */
export const getInlineSize = (document?: vscode.TextDocument) => {
    const size = vscode.workspace.getConfiguration(CONFIG_SECTION).get<number | null>('inlineSize')
    return typeof size === 'number' && size > 0
        ? size
        : vscode.workspace.getConfiguration('editor', document).get<number>('fontSize', 14)
}

export const getHoverSize = () =>
    Math.max(8, vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('hoverSize', 50))

/**
 * The hover image background: `checkerboard`, a CSS color, or undefined for none.
 * `contrast` becomes a dark or light color, opposite to the preview color.
 */
export const getHoverBackground = (previewColor: PreviewColor | undefined): string | undefined => {
    const background = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('hoverBackground', 'none').trim()
    if (!background || background === 'none') {
        return undefined
    }
    if (background !== 'contrast') {
        return background
    }
    // With no preview color, currentColor renders black.
    const light = previewColor ? isLightColor(previewColor.color) : false
    if (light === undefined) {
        return 'checkerboard'
    }
    return light ? '#1f1f1f' : '#f3f3f3'
}

export const getPreviewColor = (): PreviewColor | undefined => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
    const color = config.get<string>('currentColor', 'auto').trim()
    if (!color) {
        return undefined
    }
    const { kind } = vscode.window.activeColorTheme
    const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    return {
        color: color === 'auto' ? (isDark ? '#cccccc' : '#333333') : color,
        applyToFill: config.get<boolean>('applyColorToFill', true),
    }
}
