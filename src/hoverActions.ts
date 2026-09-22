import * as vscode from 'vscode';
import { CONFIG_SECTION } from './utils/config';
import { findSvgs, removeEscape, toDataUri, toStandaloneSvg } from './utils/svg';

/** Identifies an SVG by its document and start offset when the hover was built. */
type SvgRef = { uri: string, index: number }

const COPY_SVG = `${CONFIG_SECTION}.copySvg`;
const COPY_DATA_URI = `${CONFIG_SECTION}.copyDataUri`;
const COPY_CSS_URL = `${CONFIG_SECTION}.copyCssUrl`;
const SELECT_SVG = `${CONFIG_SECTION}.selectSvg`;

/** The commands hover links may run; passed to `MarkdownString.isTrusted`. */
export const HOVER_COMMANDS = [COPY_SVG, COPY_DATA_URI, COPY_CSS_URL, SELECT_SVG];

// No link title: VS Code then shows no tooltip for command links.
const link = (label: string, command: string, ref: SvgRef) =>
	`[${label}](command:${command}?${encodeArgs(ref)})`;

// encodeURIComponent leaves `(` `)` as is, and an unbalanced one (e.g. in a file name) would end the link.
const encodeArgs = (ref: SvgRef) =>
	encodeURIComponent(JSON.stringify([ref])).replace(/[()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** The action links shown under the hover image. Needs `supportThemeIcons` for the icons. */
export const hoverActions = (ref: SvgRef) => [
	link('$(copy) SVG', COPY_SVG, ref),
	link('$(link) Data URI', COPY_DATA_URI, ref),
	link('$(symbol-color) CSS', COPY_CSS_URL, ref),
	link('$(selection) Select', SELECT_SVG, ref),
].join(' &nbsp;·&nbsp; ');

// Closes the hover the action was clicked in. The command exists since VS Code 1.97; older versions leave it open.
const hideHover = () => vscode.commands.executeCommand('editor.action.hideHover').then(undefined, () => undefined);

// Finds the SVG again from the current text, since the document may have changed since the hover was built.
const resolve = async (ref: SvgRef) => {
	await hideHover();
	const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(ref.uri));
	const match = findSvgs(document.getText()).find(svg => svg.index === ref.index);
	if (!match) {
		vscode.window.showWarningMessage('The SVG has changed since the hover was shown. Hover over it again.');
		return undefined;
	}
	return { document, match };
}

const copy = async (ref: SvgRef, format: (svg: string) => string, label: string) => {
	const found = await resolve(ref);
	if (!found) {
		return;
	}
	const svg = toStandaloneSvg(removeEscape(found.match.code));
	if (!svg) {
		vscode.window.showWarningMessage("This SVG couldn't be converted.");
		return;
	}
	await vscode.env.clipboard.writeText(format(svg));
	vscode.window.setStatusBarMessage(`$(check) Copied ${label}`, 2500);
}

export const registerHoverCommands = () => [
	vscode.commands.registerCommand(COPY_SVG, (ref: SvgRef) => copy(ref, svg => svg, 'SVG')),
	vscode.commands.registerCommand(COPY_DATA_URI, (ref: SvgRef) => copy(ref, toDataUri, 'data URI')),
	vscode.commands.registerCommand(COPY_CSS_URL, (ref: SvgRef) => copy(ref, svg => `url("${toDataUri(svg)}")`, 'CSS url()')),
	vscode.commands.registerCommand(SELECT_SVG, async (ref: SvgRef) => {
		const found = await resolve(ref);
		if (!found) {
			return;
		}
		const { document, match } = found;
		const editor = vscode.window.activeTextEditor?.document === document
			? vscode.window.activeTextEditor
			: await vscode.window.showTextDocument(document);
		const range = new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match.length));
		editor.selection = new vscode.Selection(range.start, range.end);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
	}),
];
