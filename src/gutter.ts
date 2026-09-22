import * as vscode from 'vscode';

/**
 * Gutter icons are set on the decoration *type*, not per decoration, so every
 * distinct SVG needs its own type. Types are cached by image and disposed once
 * no document uses them.
 */
export class GutterIcons implements vscode.Disposable {
	private readonly types = new Map<string, vscode.TextEditorDecorationType>();
	/** Images each document currently shows, keyed by document URI. */
	private readonly usage = new Map<string, Set<string>>();

	/** Shows one icon per `{ image, line }` in the editor's gutter, replacing its previous icons. */
	set(editor: vscode.TextEditor, icons: { image: string, line: number }[]) {
		const byImage = new Map<string, vscode.Range[]>();
		for (const { image, line } of icons) {
			const ranges = byImage.get(image) ?? [];
			ranges.push(new vscode.Range(line, 0, line, 0));
			byImage.set(image, ranges);
		}
		const key = editor.document.uri.toString();
		const previous = this.usage.get(key) ?? new Set<string>();
		for (const [image, ranges] of byImage) {
			editor.setDecorations(this.getType(image), ranges);
		}
		for (const image of previous) {
			if (!byImage.has(image)) {
				const type = this.types.get(image);
				if (type) {
					editor.setDecorations(type, []);
				}
			}
		}
		if (byImage.size) {
			this.usage.set(key, new Set(byImage.keys()));
		} else {
			this.usage.delete(key);
		}
		this.disposeUnused();
	}

	/** Forgets a document, e.g. when it's closed. */
	forget(document: vscode.TextDocument) {
		if (this.usage.delete(document.uri.toString())) {
			this.disposeUnused();
		}
	}

	private getType(image: string) {
		let type = this.types.get(image);
		if (!type) {
			type = vscode.window.createTextEditorDecorationType({
				gutterIconPath: vscode.Uri.parse(image),
				gutterIconSize: 'contain',
			});
			this.types.set(image, type);
		}
		return type;
	}

	private disposeUnused() {
		const used = new Set<string>();
		this.usage.forEach(images => images.forEach(image => used.add(image)));
		for (const [image, type] of this.types) {
			if (!used.has(image)) {
				type.dispose();
				this.types.delete(image);
			}
		}
	}

	dispose() {
		this.types.forEach(type => type.dispose());
		this.types.clear();
		this.usage.clear();
	}
}
