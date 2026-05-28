import * as vscode from 'vscode';
import { describeChange, ProcessChange } from '../../fluig/workflow/process/process.diff';
import { ProcessDefinition } from '../../fluig/workflow/process/process.types';

const diffPanels = new Map<string, vscode.WebviewPanel>();

export function openDiffPanel(
    processUri: vscode.Uri,
    beforeLabel: string,
    afterLabel: string,
    before: ProcessDefinition,
    after: ProcessDefinition,
    changes: ProcessChange[]
): void {
    const key = processUri.toString();
    let panel = diffPanels.get(key);
    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'fluigProcessDiff',
            `Diff: ${processUri.path.split('/').pop()}`,
            vscode.ViewColumn.Beside,
            { enableScripts: false, retainContextWhenHidden: true }
        );
        panel.onDidDispose(() => diffPanels.delete(key));
        diffPanels.set(key, panel);
    } else {
        panel.reveal(vscode.ViewColumn.Beside);
    }
    panel.title = `Diff: ${after.metadata.name || after.metadata.id}`;
    panel.webview.html = renderHtml(beforeLabel, afterLabel, before, after, changes);
}

export function disposeAllDiffPanels(): void {
    for (const p of diffPanels.values()) {
        p.dispose();
    }
    diffPanels.clear();
}

function renderHtml(
    beforeLabel: string,
    afterLabel: string,
    before: ProcessDefinition,
    after: ProcessDefinition,
    changes: ProcessChange[]
): string {
    const groups = groupChanges(changes);

    const sectionsHtml = Object.entries(groups)
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => renderSection(label, items))
        .join('');

    const totalsHtml = changes.length === 0
        ? `<div class="empty">$(check) Sem mudanças semânticas entre as versões.</div>`
        : `<div class="totals">${changes.length} mudança(s) detectada(s)</div>`;

    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Diff de Processo</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 16px 20px;
            line-height: 1.45;
        }
        h1 { font-size: 16px; margin: 0 0 4px 0; }
        h2 {
            font-size: 13px; margin: 18px 0 8px;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header {
            display: flex; gap: 16px; align-items: baseline;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header .versions { opacity: 0.7; font-size: 12px; }
        .totals { margin-top: 10px; opacity: 0.7; font-size: 12px; }
        .empty {
            margin-top: 20px;
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-charts-green, #4caf50);
            border-radius: 3px;
        }
        ul.changes { list-style: none; margin: 0; padding: 0; }
        ul.changes li {
            margin: 6px 0;
            padding: 6px 10px;
            border-radius: 3px;
            font-size: 12.5px;
            background: var(--vscode-editorWidget-background);
            border-left: 3px solid var(--vscode-panel-border);
        }
        li.added { border-left-color: var(--vscode-charts-green, #4caf50); }
        li.removed { border-left-color: var(--vscode-charts-red, #f44336); }
        li.modified { border-left-color: var(--vscode-charts-orange, #ff9800); }
        .id-tag { opacity: 0.6; font-family: var(--vscode-editor-font-family); font-size: 11px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escape(after.metadata.name || after.metadata.id)}</h1>
        <span class="versions">${escape(beforeLabel)} → ${escape(afterLabel)}</span>
    </div>
    ${totalsHtml}
    ${sectionsHtml}
</body>
</html>`;
}

function groupChanges(changes: ProcessChange[]): Record<string, ProcessChange[]> {
    const groups: Record<string, ProcessChange[]> = {
        'Metadata': [],
        'Atividades adicionadas': [],
        'Atividades removidas': [],
        'Atividades modificadas': [],
        'Fluxos adicionados': [],
        'Fluxos removidos': [],
        'Fluxos modificados': [],
    };
    for (const c of changes) {
        switch (c.kind) {
            case 'metadata-changed':
                groups['Metadata'].push(c); break;
            case 'activity-added':
                groups['Atividades adicionadas'].push(c); break;
            case 'activity-removed':
                groups['Atividades removidas'].push(c); break;
            case 'activity-renamed':
            case 'activity-kind-changed':
            case 'activity-script-changed':
            case 'activity-assignment-changed':
            case 'activity-gateway-conditions-changed':
                groups['Atividades modificadas'].push(c); break;
            case 'transition-added':
                groups['Fluxos adicionados'].push(c); break;
            case 'transition-removed':
                groups['Fluxos removidos'].push(c); break;
            case 'transition-rerouted':
            case 'transition-relabeled':
                groups['Fluxos modificados'].push(c); break;
        }
    }
    return groups;
}

function renderSection(label: string, items: ProcessChange[]): string {
    const lis = items.map(c => {
        const cssClass = classFor(c.kind);
        return `<li class="${cssClass}">${escape(describeChange(c))}</li>`;
    }).join('');
    return `<h2>${escape(label)} <span class="id-tag">(${items.length})</span></h2><ul class="changes">${lis}</ul>`;
}

function classFor(kind: ProcessChange['kind']): string {
    if (kind.endsWith('-added')) {
        return 'added';
    }
    if (kind.endsWith('-removed')) {
        return 'removed';
    }
    return 'modified';
}

function escape(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
