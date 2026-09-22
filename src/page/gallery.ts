import type { GalleryGroup, GalleryMessage } from '../gallery';

declare function acquireVsCodeApi(): { postMessage(message: GalleryMessage): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('root')!;
const status = document.getElementById('status')!;

const render = (groups: GalleryGroup[]) => {
    const count = groups.reduce((sum, group) => sum + group.matches.length, 0);
    status.textContent = count
        ? `${count} SVG${count === 1 ? '' : 's'} in ${groups.length} file${groups.length === 1 ? '' : 's'}`
        : 'No SVGs found in the included files.';

    root.replaceChildren(...groups.map(group => {
        const section = document.createElement('section');
        section.className = 'group';

        const path = document.createElement('div');
        path.className = 'path';
        path.textContent = group.path;

        const list = document.createElement('div');
        list.className = 'list';
        list.append(...group.matches.map(match => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'item';
            item.title = `Open ${group.path}`;
            item.addEventListener('click', () => {
                vscode.postMessage({ command: 'open_file', data: { uri: group.uri, index: match.index } });
            });
            const img = document.createElement('img');
            img.src = match.base64;
            img.alt = '';
            item.append(img);
            return item;
        }));

        section.append(path, list);
        return section;
    }));
};

window.addEventListener('message', ({ data }) => {
    if (data?.command === 'svg_data') {
        render(data.data);
    }
});

document.getElementById('refresh')!.addEventListener('click', () => {
    status.textContent = 'Loading…';
    vscode.postMessage({ command: 'refresh' });
});

// Ask for data only once the listener is in place, so the first message can't be missed.
vscode.postMessage({ command: 'ready' });
