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
 * The hover image background: `auto` (decided per SVG), `checkerboard`,
 * a CSS color, or undefined for none.
 */
export const getHoverBackground = (): string | undefined => {
    const background = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('hoverBackground', 'auto').trim()
    return !background || background === 'none' ? undefined : background
}

/** Whether the active color theme is dark or light. */
export const getThemeKind = (): 'dark' | 'light' => {
    const { kind } = vscode.window.activeColorTheme
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light'
}

export const getPreviewColor = (): PreviewColor | undefined => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
    const color = config.get<string>('currentColor', 'auto').trim()
    if (!color) {
        return undefined
    }
    return {
        color: color === 'auto' ? (getThemeKind() === 'dark' ? '#cccccc' : '#333333') : color,
        applyToFill: config.get<boolean>('applyColorToFill', true),
    }
}
