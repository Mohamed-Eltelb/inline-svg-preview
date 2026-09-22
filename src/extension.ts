import * as vscode from 'vscode';
import { showGallery } from './gallery';
import { CONFIG_SECTION, getHoverBackground, getHoverSize, getInlineSize, getPreviewColor, getThemeKind } from './utils/config';
import { findSvgs, removeEscape, svg2Base64 } from './utils/svg';

export function activate(context: vscode.ExtensionContext) {
	let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
	let activeEditor = vscode.window.activeTextEditor;
	const svgPreviewDecorationType = vscode.window.createTextEditorDecorationType({});
	context.subscriptions.push(
		svgPreviewDecorationType,
		{ dispose: () => timeout && clearTimeout(timeout) },
		vscode.commands.registerCommand(`${CONFIG_SECTION}.gallery`, () => showGallery(context))
	);

	function updateDecorations() {
		if (!activeEditor) {
			return;
		}
		const { document } = activeEditor;
		const svgPreviews: vscode.DecorationOptions[] = [];
		const previewColor = getPreviewColor();
		const inlineSize = getInlineSize(document);
		const hoverSize = getHoverSize();
		const hoverBackground = getHoverBackground();
		const theme = getThemeKind();
		for (const { index, code } of findSvgs(document.getText())) {
			const svg = removeEscape(code);
			const decorationImage = svg2Base64(svg, { size: inlineSize, previewColor });
			const hoverImage = svg2Base64(svg, { size: hoverSize, keepAspectRatio: true, previewColor, background: hoverBackground, theme });
			// Skip SVGs that can't be parsed (e.g. heavy JSX) instead of failing the whole file.
			if (!decorationImage || !hoverImage?.renderedSize) {
				continue;
			}
			const { width, height } = hoverImage.originalSize;
			const sizeLabel = width && height ? `\n\n${width}×${height}` : '';
			const rendered = hoverImage.renderedSize;
			const startPos = document.positionAt(index);
			const endPos = document.positionAt(index + code.length);
			svgPreviews.push({
				range: new vscode.Range(startPos, endPos),
				hoverMessage: new vscode.MarkdownString(`![svg](${hoverImage.base64}|width=${rendered.width},height=${rendered.height})${sizeLabel}`),
				renderOptions: {
					before: {
						contentIconPath: vscode.Uri.parse(decorationImage.base64),
						height: `${inlineSize}px`,
						width: `${inlineSize}px`,
					},
				},
			});
		}
		activeEditor.setDecorations(svgPreviewDecorationType, svgPreviews);
	}

	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 500);
		} else {
			updateDecorations();
		}
	}

	if (activeEditor) {
		triggerUpdateDecorations();
	}
	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations(true);
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeActiveColorTheme(() => {
		triggerUpdateDecorations();
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration(CONFIG_SECTION) || event.affectsConfiguration('editor.fontSize')) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);
}

export function deactivate() {}
