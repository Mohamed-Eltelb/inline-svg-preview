import * as vscode from 'vscode';
import { CONFIG_SECTION, findIncludedFiles, getFileFilter, getPreviewColor, isDocumentIncluded } from './utils/config';
import { findSvgs, removeEscape, svg2Base64 } from './utils/svg';

export type GalleryGroup = {
    path: string
    uri: string
    matches: { index: number, base64: string }[]
}

export type GalleryMessage =
    | { command: 'ready' }
    | { command: 'refresh' }
    | { command: 'open_file', data: { uri: string, index: number } }

let currentPanel: vscode.WebviewPanel | undefined

const loadGroups = async (): Promise<GalleryGroup[] | undefined> => {
    const filter = getFileFilter()
    if (!filter) {
        return undefined
    }
    const previewColor = getPreviewColor()
    const decoder = new TextDecoder('utf-8')
    const groups = await Promise.all((await findIncludedFiles(filter)).map(async uri => {
        let text: string
        try {
            text = decoder.decode(await vscode.workspace.fs.readFile(uri))
        } catch {
            return undefined
        }
        const matches = findSvgs(text).flatMap(({ index, code }) => {
            const image = svg2Base64(removeEscape(code), { size: 40, previewColor })
            return image ? [{ index, base64: image.base64 }] : []
        })
        return matches.length
            ? { path: vscode.workspace.asRelativePath(uri), uri: uri.toString(), matches }
            : undefined
    }))
    return groups.filter((group): group is GalleryGroup => !!group)
}

export const showGallery = async (context: vscode.ExtensionContext) => {
    if (!getFileFilter()) {
        vscode.window.showWarningMessage(`Set "${CONFIG_SECTION}.gallery.include" or "${CONFIG_SECTION}.gallery.exclude" to choose which files the SVG gallery shows.`)
        return
    }
    if (currentPanel) {
        currentPanel.reveal()
        return
    }

    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'out', 'page')
    const panel = vscode.window.createWebviewPanel(
        'inlineSvgPreview.gallery',
        'SVG Gallery',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [mediaRoot],
        }
    );
    currentPanel = panel
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'gallery.js'))
    panel.webview.html = getWebviewContent(panel.webview, scriptUri)

    const postData = async () => {
        panel.webview.postMessage({ command: 'svg_data', data: (await loadGroups()) ?? [] })
    }

    const disposables: vscode.Disposable[] = [
        panel.webview.onDidReceiveMessage(async (message: GalleryMessage) => {
            switch (message.command) {
                case 'ready':
                case 'refresh':
                    await postData()
                    return
                case 'open_file':
                    try {
                        const editor = await vscode.window.showTextDocument(vscode.Uri.parse(message.data.uri))
                        const pos = editor.document.positionAt(message.data.index)
                        editor.selection = new vscode.Selection(pos, pos)
                        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
                    } catch {
                        vscode.window.showErrorMessage('Oops! Unable to open the file.')
                    }
                    return
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            if (isDocumentIncluded(document)) {
                postData()
            }
        }),
        vscode.window.onDidChangeActiveColorTheme(() => postData()),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(CONFIG_SECTION)) {
                postData()
            }
        }),
    ]

    panel.onDidDispose(() => {
        currentPanel = undefined
        disposables.forEach(disposable => disposable.dispose())
    }, null, context.subscriptions)
}

function getWebviewContent(webview: vscode.Webview, scriptUri: vscode.Uri) {
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join('')
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SVG Gallery</title>
    <style nonce="${nonce}">
        body { padding: 12px 20px; }
        .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .toolbar button {
            background: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer;
        }
        .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
        .status { color: var(--vscode-descriptionForeground); }
        .group { margin-bottom: 20px; }
        .path { font-size: 14px; font-weight: 600; margin-bottom: 8px; word-break: break-all; }
        .list { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, 50px); grid-auto-rows: 50px; }
        .item {
            position: relative; display: flex; align-items: center; justify-content: center;
            width: 50px; height: 50px; padding: 5px; box-sizing: border-box; overflow: hidden;
            background: none; cursor: pointer;
            border: 1px solid var(--vscode-panel-border, #8884); border-radius: 4px;
        }
        .item:hover, .item:focus-visible { border-color: var(--vscode-focusBorder); outline: none; }
        .item:hover::after, .item:focus-visible::after {
            content: 'OPEN'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
            background: #0008; color: #fff; font-size: 10px;
        }
        .item img { max-width: 100%; max-height: 100%; }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="refresh" type="button">Refresh</button>
        <span id="status" class="status">Loading…</span>
    </div>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
