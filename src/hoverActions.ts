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

// The title is a quoted markdown link title, so quotes, backslashes and parentheses in it are escaped.
const link = (label: string, command: string, ref: SvgRef, title: string) =>
	`[${label}](command:${command}?${encodeArgs(ref)} "${title.replace(/["\\()]/g, '\\$&')}")`;

// encodeURIComponent leaves `(` `)` as is, and an unbalanced one (e.g. in a file name) would end the link.
const encodeArgs = (ref: SvgRef) =>
	encodeURIComponent(JSON.stringify([ref])).replace(/[()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** The action links shown under the hover image. Needs `supportThemeIcons` for the icons. */
export const hoverActions = (ref: SvgRef) => [
	link('$(copy) SVG', COPY_SVG, ref, 'Copy as SVG markup (JSX is converted to SVG)'),
	link('$(link) Data URI', COPY_DATA_URI, ref, 'Copy as data:image/svg+xml URI, e.g. for <img src>'),
	link('$(symbol-color) CSS', COPY_CSS_URL, ref, 'Copy as a CSS url() with a data URI'),
	link('$(selection) Select', SELECT_SVG, ref, 'Select the SVG code'),
].join(' &nbsp;·&nbsp; ');

// Finds the SVG again from the current text, since the document may have changed since the hover was built.
const resolve = async (ref: SvgRef) => {
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
