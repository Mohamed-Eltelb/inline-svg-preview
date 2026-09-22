import * as vscode from 'vscode';
import { showGallery } from './gallery';
import { GutterIcons } from './gutter';
import { HOVER_COMMANDS, hoverActions, registerHoverCommands } from './hoverActions';
import { CONFIG_SECTION, getHoverBackground, getHoverSize, getInlineSize, getPreviewColor, getPreviewPosition, getThemeKind } from './utils/config';
import { findSvgs, removeEscape, svg2Base64 } from './utils/svg';

export function activate(context: vscode.ExtensionContext) {
	let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
	// Carries the hover and, in inline mode, the icon before the SVG code.
	const svgPreviewDecorationType = vscode.window.createTextEditorDecorationType({});
	const gutterIcons = new GutterIcons();
	context.subscriptions.push(
		svgPreviewDecorationType,
		gutterIcons,
		{ dispose: () => timeout && clearTimeout(timeout) },
		vscode.commands.registerCommand(`${CONFIG_SECTION}.gallery`, () => showGallery(context)),
		...registerHoverCommands()
	);

	function updateDecorations(editor: vscode.TextEditor) {
		const { document } = editor;
		const svgPreviews: vscode.DecorationOptions[] = [];
		const icons: { image: string, line: number }[] = [];
		const position = getPreviewPosition();
		const previewColor = getPreviewColor();
		const inlineSize = getInlineSize(document);
		const hoverSize = getHoverSize();
		const hoverBackground = getHoverBackground();
		const theme = getThemeKind();
		const showActions = vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('hoverActions', true);
		for (const { index, length, code } of findSvgs(document.getText())) {
			const svg = removeEscape(code);
			// In the gutter the icon is scaled to fit, so keep its shape instead of squashing it square.
			const iconImage = svg2Base64(svg, { size: inlineSize, keepAspectRatio: position === 'gutter', previewColor });
			const hoverImage = svg2Base64(svg, { size: hoverSize, keepAspectRatio: true, previewColor, background: hoverBackground, theme });
			// Skip SVGs that can't be parsed (e.g. heavy JSX) instead of failing the whole file.
			if (!iconImage || !hoverImage?.renderedSize) {
				continue;
			}
			const rendered = hoverImage.renderedSize;
			const startPos = document.positionAt(index);
			const endPos = document.positionAt(index + length);
			const hoverMessage = new vscode.MarkdownString(
				`![svg](${hoverImage.base64}|width=${rendered.width},height=${rendered.height})`
					+ (showActions ? `\n\n${hoverActions({ uri: document.uri.toString(), index })}` : ''),
				true
			);
			hoverMessage.isTrusted = { enabledCommands: HOVER_COMMANDS };
			svgPreviews.push({
				range: new vscode.Range(startPos, endPos),
				hoverMessage,
				renderOptions: position === 'inline' ? {
					before: {
						contentIconPath: vscode.Uri.parse(iconImage.base64),
						height: `${inlineSize}px`,
						width: `${inlineSize}px`,
					},
				} : undefined,
			});
			if (position === 'gutter') {
				icons.push({ image: iconImage.base64, line: startPos.line });
			}
		}
		editor.setDecorations(svgPreviewDecorationType, svgPreviews);
		gutterIcons.set(editor, icons);
	}

	function updateVisibleEditors() {
		vscode.window.visibleTextEditors.forEach(updateDecorations);
	}

	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}
		if (throttle) {
			timeout = setTimeout(() => updateDecorations(editor), 500);
		} else {
			updateDecorations(editor);
		}
	}

	updateVisibleEditors();

	vscode.window.onDidChangeActiveTextEditor(() => {
		triggerUpdateDecorations();
	}, null, context.subscriptions);

	vscode.window.onDidChangeVisibleTextEditors(() => {
		updateVisibleEditors();
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document === vscode.window.activeTextEditor?.document) {
			triggerUpdateDecorations(true);
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidCloseTextDocument(document => {
		gutterIcons.forget(document);
	}, null, context.subscriptions);

	vscode.window.onDidChangeActiveColorTheme(() => {
		updateVisibleEditors();
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration(CONFIG_SECTION) || event.affectsConfiguration('editor.fontSize')) {
			updateVisibleEditors();
		}
	}, null, context.subscriptions);
}

export function deactivate() {}
