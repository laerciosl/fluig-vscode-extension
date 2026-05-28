import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { parseProcess } from '../../fluig/workflow/process/process.parser';
import { buildRenderModel, RenderModel } from '../../fluig/workflow/process/process-to-render.mapper';
import { validateProcessDefinition, ValidationIssue } from '../../fluig/workflow/process/process.validator';
import { patchActivityName, patchActivityScriptFileName } from '../../fluig/workflow/process/process.patcher';
import { createLogger } from '../logger';

const log = createLogger('[PROCESS]');

const panels = new Map<string, WorkflowPreviewPanel>();

export function openWorkflowPreview(processUri: vscode.Uri): void {
    const key = processUri.toString();
    const existing = panels.get(key);
    if (existing) {
        existing.reveal();
        return;
    }
    const panel = new WorkflowPreviewPanel(processUri);
    panels.set(key, panel);
    panel.onDispose(() => panels.delete(key));
}

export function disposeAllPreviews(): void {
    for (const panel of panels.values()) {
        panel.dispose();
    }
    panels.clear();
}

class WorkflowPreviewPanel {
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly onDisposeHandlers: (() => void)[] = [];
    private currentXml = '';

    constructor(private readonly processUri: vscode.Uri) {
        this.panel = vscode.window.createWebviewPanel(
            'fluigWorkflowPreview',
            this.buildTitle(),
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg)),
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (doc.uri.toString() === this.processUri.toString()) {
                    void this.refresh();
                }
            }),
            this.panel.onDidDispose(() => this.dispose()),
        );

        void this.refresh();
    }

    reveal(): void {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    onDispose(handler: () => void): void {
        this.onDisposeHandlers.push(handler);
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        for (const h of this.onDisposeHandlers) {
            h();
        }
        this.onDisposeHandlers.length = 0;
        this.panel.dispose();
    }

    private buildTitle(): string {
        const name = this.processUri.path.split('/').pop() ?? 'Workflow';
        return `Preview: ${name}`;
    }

    private async refresh(): Promise<void> {
        let xml: string;
        try {
            const bytes = await vscode.workspace.fs.readFile(this.processUri);
            xml = Buffer.from(bytes).toString('utf-8');
        } catch {
            this.panel.webview.html = renderErrorHtml('Não foi possível ler o arquivo .process.');
            return;
        }

        this.currentXml = xml;

        let def;
        try {
            def = parseProcess(xml);
        } catch {
            this.panel.webview.html = renderErrorHtml('Arquivo .process inválido — verifique o XML.');
            return;
        }

        const model = buildRenderModel(def);
        const issues = validateProcessDefinition(def, { processFsPath: this.processUri.fsPath });
        this.panel.title = `Preview: ${def.metadata.name || def.metadata.id}`;
        this.panel.webview.html = renderModelHtml(model, issues);
        log.debug(
            `Preview refresh: ${def.metadata.id} (${model.activities.length} atividades, ${model.edges.length} flows, ${issues.length} issues)`
        );
    }

    private async handleMessage(message: PreviewMessage): Promise<void> {
        switch (message.type) {
            case 'openScript':
                await this.openScript(message.scriptFileName);
                break;
            case 'openSubProcess':
                await this.openSubProcess(message.processId);
                break;
            case 'patchActivity': {
                const { id, name, scriptFileName } = message.patch;
                let xml = this.currentXml;
                if (name !== undefined) {
                    xml = patchActivityName(xml, id, name);
                }
                if (scriptFileName !== undefined) {
                    xml = patchActivityScriptFileName(xml, id, scriptFileName);
                }
                try {
                    await vscode.workspace.fs.writeFile(
                        this.processUri,
                        Buffer.from(xml, 'utf-8')
                    );
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Erro ao salvar .process: ${err.message}`);
                    return;
                }
                await this.refresh();
                break;
            }
        }
    }

    private async openScript(scriptFileName: string): Promise<void> {
        const scriptUri = vscode.Uri.file(
            join(dirname(this.processUri.fsPath), 'scripts', scriptFileName)
        );
        if (!existsSync(scriptUri.fsPath)) {
            vscode.window.showWarningMessage(
                `Script "${scriptFileName}" não encontrado em workflow/scripts/. Importe-o do Fluig primeiro.`
            );
            return;
        }
        await vscode.window.showTextDocument(scriptUri, { viewColumn: vscode.ViewColumn.One });
    }

    private async openSubProcess(processId: string): Promise<void> {
        const candidate = vscode.Uri.file(
            join(dirname(this.processUri.fsPath), `${processId}.process`)
        );
        if (!existsSync(candidate.fsPath)) {
            vscode.window.showWarningMessage(
                `Sub-processo "${processId}.process" não encontrado em workflow/.`
            );
            return;
        }
        openWorkflowPreview(candidate);
    }
}

// ── Messages ──────────────────────────────────────────────────────────────

type PreviewMessage =
    | { type: 'openScript'; scriptFileName: string }
    | { type: 'openSubProcess'; processId: string }
    | { type: 'patchActivity'; patch: { id: string; name?: string; scriptFileName?: string } };

// ── HTML rendering ────────────────────────────────────────────────────────

function renderErrorHtml(message: string): string {
    return /* html */ `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family: var(--vscode-font-family); padding: 24px; color: var(--vscode-errorForeground);">
    <h3>Preview indisponível</h3>
    <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

function buildIssuesMap(issues: ValidationIssue[]): Record<string, { message: string; severity: string }[]> {
    const map: Record<string, { message: string; severity: string }[]> = {};
    for (const issue of issues) {
        if (!issue.targetId) { continue; }
        if (!map[issue.targetId]) { map[issue.targetId] = []; }
        map[issue.targetId].push({ message: issue.message, severity: issue.severity });
    }
    return map;
}

function renderModelHtml(model: RenderModel, issues: ValidationIssue[]): string {
    const modelJson = JSON.stringify(model);
    const issuesJson = JSON.stringify(buildIssuesMap(issues));
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${escapeHtml(model.processName)}</title>
    <style>${STYLES}</style>
</head>
<body>
    <header class="toolbar">
        <div class="title">
            <strong>${escapeHtml(model.processName || model.processId)}</strong>
            <span class="badge">v${escapeHtml(model.processVersion)}</span>
            <span class="meta">${model.activities.length} atividades · ${model.edges.length} fluxos</span>
        </div>
        <div class="actions">
            <button id="btn-fit" title="Ajustar à tela">$ Fit</button>
            <button id="btn-zoom-in" title="Aumentar zoom">+</button>
            <button id="btn-zoom-out" title="Diminuir zoom">−</button>
            <span id="zoom-indicator">100%</span>
        </div>
    </header>
    <div class="main-area">
        <div id="canvas-wrapper">
            <svg id="canvas" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        <aside id="property-panel" class="panel-hidden">
            <div class="panel-header">
                <span class="panel-title">Propriedades</span>
                <button id="btn-panel-close" title="Fechar painel">×</button>
            </div>
            <div class="panel-body">
                <div class="field-row">
                    <label class="field-label">ID</label>
                    <span id="prop-id" class="field-readonly"></span>
                </div>
                <div class="field-row">
                    <label class="field-label">Tipo</label>
                    <span id="prop-kind" class="field-readonly"></span>
                </div>
                <div class="field-row">
                    <label class="field-label">Nome</label>
                    <input id="prop-name" type="text" class="field-input" placeholder="Nome da atividade"/>
                </div>
                <div class="field-row" id="row-script">
                    <label class="field-label">Script</label>
                    <input id="prop-script" type="text" class="field-input" placeholder="arquivo.js"/>
                </div>
                <div class="field-row" id="row-mechanism">
                    <label class="field-label">Mecanismo</label>
                    <span id="prop-mechanism" class="field-readonly"></span>
                </div>
                <div class="field-row" id="row-role">
                    <label class="field-label">Papel/Grupo</label>
                    <span id="prop-role" class="field-readonly"></span>
                </div>
                <div id="row-issues" class="issues-list" hidden></div>
                <div class="panel-actions">
                    <button id="btn-save-props" class="btn-primary">Salvar</button>
                    <button id="btn-open-script" hidden>Abrir Script</button>
                    <button id="btn-open-subprocess" hidden>Abrir Sub-processo</button>
                </div>
            </div>
        </aside>
    </div>
    <div id="empty-hint" hidden>Nenhuma atividade encontrada.</div>
    <script>
        const MODEL = ${modelJson};
        const VALIDATION_ISSUES = ${issuesJson};
        ${CLIENT_SCRIPT}
    </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── CSS ───────────────────────────────────────────────────────────────────

const STYLES = `
* { box-sizing: border-box; }
html, body {
    margin: 0; padding: 0; height: 100%; overflow: hidden;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex; flex-direction: column;
}
.toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background); flex-shrink: 0;
}
.toolbar .title strong { font-size: 13px; }
.toolbar .badge {
    margin-left: 8px; padding: 2px 6px; border-radius: 8px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    font-size: 11px;
}
.toolbar .meta { margin-left: 12px; opacity: 0.7; font-size: 11px; }
.toolbar .actions { display: flex; gap: 4px; align-items: center; }
.toolbar button {
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    padding: 2px 10px; cursor: pointer; font-family: inherit; font-size: 12px;
    border-radius: 3px;
}
.toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground); }
#zoom-indicator { font-size: 11px; opacity: 0.7; margin-left: 6px; min-width: 40px; text-align: right; }

.main-area { display: flex; flex: 1; overflow: hidden; }
#canvas-wrapper { flex: 1; overflow: hidden; background: #fafafa; cursor: grab; position: relative; }
#canvas-wrapper.panning { cursor: grabbing; }
#canvas { width: 100%; height: 100%; user-select: none; }
#empty-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.6; }

/* Property panel */
#property-panel {
    width: 240px; flex-shrink: 0; border-left: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background); display: flex; flex-direction: column;
    overflow: hidden;
}
#property-panel.panel-hidden { display: none; }
.panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px; font-weight: 600; flex-shrink: 0;
}
#btn-panel-close {
    background: none; border: none; cursor: pointer; font-size: 16px; line-height: 1;
    color: var(--vscode-foreground); opacity: 0.6; padding: 0 2px;
}
#btn-panel-close:hover { opacity: 1; }
.panel-body { padding: 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.field-row { display: flex; flex-direction: column; gap: 2px; }
.field-label { font-size: 10px; text-transform: uppercase; opacity: 0.6; letter-spacing: 0.5px; }
.field-readonly {
    font-size: 12px; padding: 4px 0; word-break: break-all; opacity: 0.85;
}
.field-input {
    font-size: 12px; font-family: inherit; padding: 4px 6px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 3px; width: 100%;
}
.field-input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
.panel-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.panel-actions button {
    font-size: 12px; font-family: inherit; padding: 4px 10px; cursor: pointer; border-radius: 3px;
    border: 1px solid var(--vscode-button-border, transparent);
}
.btn-primary {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.panel-actions button:not(.btn-primary) {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
}
.panel-actions button:not(.btn-primary):hover { background: var(--vscode-button-secondaryHoverBackground); }

/* Validation issues in panel */
.issues-list { display: flex; flex-direction: column; gap: 4px; }
.issue-item {
    font-size: 11px; padding: 4px 8px; border-radius: 3px;
    border-left: 3px solid;
}
.issue-item.error { border-color: #d32f2f; background: rgba(211,47,47,0.08); }
.issue-item.warning { border-color: #f57f17; background: rgba(245,127,23,0.08); }

/* BPM diagram */
.pool { fill: none; stroke: #999; stroke-width: 1; }
.swimlane { fill: rgba(150, 150, 150, 0.05); stroke: #ccc; stroke-width: 1; }
.swimlane-label {
    font-size: 11px; fill: #444; font-weight: 600;
    text-anchor: middle; dominant-baseline: middle;
}
.pool-label {
    font-size: 12px; fill: #333; font-weight: 700;
    text-anchor: middle; dominant-baseline: middle;
}

.node { cursor: pointer; }
.node:hover .shape { stroke: #2962ff; stroke-width: 2.5; }
.node.selected .shape { stroke: #d84315; stroke-width: 3; }
.node.has-error .shape { stroke: #d32f2f !important; stroke-width: 3 !important; }
.node.has-warning:not(.has-error) .shape { stroke: #f57f17 !important; stroke-width: 2.5 !important; }
.shape { fill: white; stroke: #333; stroke-width: 1.5; }
.node-label { font-size: 10px; fill: #222; text-anchor: middle; dominant-baseline: middle; pointer-events: none; paint-order: stroke; stroke: rgba(255,255,255,0.9); stroke-width: 4; stroke-linejoin: round; }

.start .shape { fill: #c8f7c5; stroke: #2e7d32; stroke-width: 2; }
.end .shape { fill: #ffcdd2; stroke: #c62828; stroke-width: 3; }
.end-cancel .shape { fill: #ffe0b2; stroke: #ef6c00; stroke-width: 3; }
.task .shape, .service-task .shape { fill: #fafdff; stroke: #1565c0; rx: 6; ry: 6; }
.service-task .shape-overlay { fill: #fff8e1; }
.subprocess .shape { fill: white; stroke: #1565c0; stroke-width: 3; rx: 6; ry: 6; }
.gateway-exclusive .shape { fill: #fff9c4; stroke: #f57f17; stroke-width: 2; }
.intermediate-link-throw .shape, .intermediate-link-receive .shape {
    fill: #fff9c4; stroke: #f9a825; stroke-width: 2;
}
.intermediate-error .shape { fill: #ffccbc; stroke: #d84315; stroke-width: 2; }
.annotation .shape { fill: #f5f5f5; stroke: #999; stroke-dasharray: 3 3; }
.annotation-label { font-size: 9px; fill: #555; text-anchor: start; dominant-baseline: hanging; }

.edge { fill: none; stroke: #555; stroke-width: 1.5; }
.edge-arrow { fill: #555; }
.edge-label {
    font-size: 10px; fill: #444; text-anchor: middle; dominant-baseline: middle;
    paint-order: stroke; stroke: white; stroke-width: 3;
}

.issue-dot { pointer-events: none; }
`;

// ── Client script (executes inside the webview) ───────────────────────────

const CLIENT_SCRIPT = /* javascript */ `
(() => {
    const vscode = acquireVsCodeApi();
    const svg = document.getElementById('canvas');
    const wrapper = document.getElementById('canvas-wrapper');
    const zoomIndicator = document.getElementById('zoom-indicator');
    const propertyPanel = document.getElementById('property-panel');

    if (!MODEL.activities.length) {
        document.getElementById('empty-hint').hidden = false;
        return;
    }

    const vb = MODEL.viewBox;
    let viewBox = { ...vb };
    let panning = false;
    let panStart = null;
    let selectedActivity = null;

    function applyViewBox() {
        svg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.width + ' ' + viewBox.height);
        const scale = vb.width / viewBox.width;
        zoomIndicator.textContent = Math.round(scale * 100) + '%';
    }

    function fit() {
        viewBox = { ...vb };
        applyViewBox();
    }

    function zoom(factor, cx, cy) {
        const newW = viewBox.width / factor;
        const newH = viewBox.height / factor;
        const px = cx !== undefined ? cx : viewBox.x + viewBox.width / 2;
        const py = cy !== undefined ? cy : viewBox.y + viewBox.height / 2;
        viewBox = {
            x: px - (px - viewBox.x) / factor,
            y: py - (py - viewBox.y) / factor,
            width: newW,
            height: newH,
        };
        applyViewBox();
    }

    // ── Render ──────────────────────────────────────────────────────────
    const NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs = {}) {
        const n = document.createElementNS(NS, tag);
        for (const k of Object.keys(attrs)) {
            n.setAttribute(k, String(attrs[k]));
        }
        return n;
    }

    // Arrow marker
    const defs = el('defs');
    const marker = el('marker', {
        id: 'arrow', markerWidth: 10, markerHeight: 10, refX: 9, refY: 5,
        orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
    });
    marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'edge-arrow' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Pool
    for (const p of MODEL.pools) {
        const rect = el('rect', { x: p.x, y: p.y, width: p.width, height: p.height, class: 'pool' });
        svg.appendChild(rect);
        if (p.label) {
            const t = el('text', { x: p.x + 15, y: p.y + p.height / 2, transform: 'rotate(-90 ' + (p.x + 15) + ' ' + (p.y + p.height / 2) + ')', class: 'pool-label' });
            t.textContent = p.label;
            svg.appendChild(t);
        }
    }

    // Swimlanes
    for (const lane of MODEL.swimlanes) {
        const rect = el('rect', { x: lane.x, y: lane.y, width: lane.width, height: lane.height, class: 'swimlane' });
        svg.appendChild(rect);
        if (lane.label) {
            const labelX = lane.x + 15;
            const labelY = lane.y + lane.height / 2;
            const t = el('text', {
                x: labelX, y: labelY,
                transform: 'rotate(-90 ' + labelX + ' ' + labelY + ')',
                class: 'swimlane-label',
            });
            t.textContent = lane.label;
            svg.appendChild(t);
        }
    }

    // Annotations
    for (const a of MODEL.annotations) {
        const g = el('g', { class: 'node annotation' });
        g.appendChild(el('rect', { x: a.x, y: a.y, width: a.width, height: a.height, class: 'shape', rx: 4, ry: 4 }));
        const t = el('text', { x: a.x + 8, y: a.y + 8, class: 'annotation-label' });
        wrapText(t, a.label || '', a.width - 16);
        g.appendChild(t);
        svg.appendChild(g);
    }

    // Edges
    for (const e of MODEL.edges) {
        const wps = e.waypoints;
        if (wps.length < 2) {
            continue;
        }
        const d = 'M ' + wps.map(p => p.x + ' ' + p.y).join(' L ');
        const path = el('path', { d, class: 'edge', 'marker-end': 'url(#arrow)' });
        svg.appendChild(path);
        if (e.label) {
            const mid = wps[Math.floor(wps.length / 2) - 1] || wps[0];
            const next = wps[Math.floor(wps.length / 2)] || wps[wps.length - 1];
            const mx = (mid.x + next.x) / 2;
            const my = (mid.y + next.y) / 2;
            const t = el('text', { x: mx, y: my - 4, class: 'edge-label' });
            t.textContent = e.label;
            svg.appendChild(t);
        }
    }

    // Activities
    for (const a of MODEL.activities) {
        const issues = VALIDATION_ISSUES[a.id] || [];
        const hasError = issues.some(i => i.severity === 'error');
        const hasWarning = issues.some(i => i.severity === 'warning');
        let cls = 'node ' + a.kind;
        if (hasError) cls += ' has-error';
        else if (hasWarning) cls += ' has-warning';

        const g = el('g', { class: cls, 'data-id': a.id });
        const cx = a.x + a.width / 2;
        const cy = a.y + a.height / 2;

        if (a.kind === 'start' || a.kind === 'end' || a.kind === 'end-cancel' ||
            a.kind === 'intermediate-link-throw' || a.kind === 'intermediate-link-receive' ||
            a.kind === 'intermediate-error') {
            const r = Math.min(a.width, a.height) / 2;
            g.appendChild(el('circle', { cx, cy, r, class: 'shape' }));
            if (a.kind === 'intermediate-link-throw' || a.kind === 'intermediate-link-receive') {
                const filled = a.kind === 'intermediate-link-throw';
                g.appendChild(el('path', {
                    d: 'M ' + (cx - r/2) + ' ' + (cy - r/3) +
                       ' L ' + (cx + r/3) + ' ' + (cy - r/3) +
                       ' L ' + (cx + r/3) + ' ' + (cy - r/2) +
                       ' L ' + (cx + r*0.8) + ' ' + cy +
                       ' L ' + (cx + r/3) + ' ' + (cy + r/2) +
                       ' L ' + (cx + r/3) + ' ' + (cy + r/3) +
                       ' L ' + (cx - r/2) + ' ' + (cy + r/3) + ' Z',
                    fill: filled ? '#f9a825' : 'none',
                    stroke: '#f9a825',
                    'stroke-width': 1.5,
                }));
            } else if (a.kind === 'intermediate-error') {
                g.appendChild(el('path', {
                    d: 'M ' + (cx - r/2) + ' ' + (cy + r/2) +
                       ' L ' + (cx - r/6) + ' ' + (cy - r/2) +
                       ' L ' + (cx + r/4) + ' ' + cy +
                       ' L ' + (cx + r/2) + ' ' + (cy - r/2) +
                       ' L ' + (cx + r/4) + ' ' + (cy + r/2) +
                       ' L ' + (cx - r/4) + ' ' + cy + ' Z',
                    fill: '#d84315', stroke: '#d84315',
                }));
            }
        } else if (a.kind === 'gateway-exclusive') {
            const hw = a.width / 2;
            const hh = a.height / 2;
            const pts = (cx) + ',' + (cy - hh) + ' ' +
                        (cx + hw) + ',' + cy + ' ' +
                        cx + ',' + (cy + hh) + ' ' +
                        (cx - hw) + ',' + cy;
            g.appendChild(el('polygon', { points: pts, class: 'shape' }));
            const tx = el('text', { x: cx, y: cy, 'font-size': '18', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#f57f17', 'font-weight': 'bold' });
            tx.textContent = '×';
            g.appendChild(tx);
        } else {
            const rect = el('rect', { x: a.x, y: a.y, width: a.width, height: a.height, rx: 6, ry: 6, class: 'shape' });
            g.appendChild(rect);
            if (a.kind === 'service-task') {
                g.appendChild(el('rect', { x: a.x + 5, y: a.y + 5, width: 14, height: 14, class: 'shape-overlay', rx: 2, ry: 2 }));
                const icon = el('text', { x: a.x + 12, y: a.y + 13, 'font-size': 11, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
                icon.textContent = '⚙';
                g.appendChild(icon);
            }
        }

        // Clip path for rectangular nodes prevents label overflow outside the shape.
        const isRectNode = a.kind === 'task' || a.kind === 'service-task' || a.kind === 'subprocess';
        let clipPathId = null;
        if (isRectNode) {
            clipPathId = 'lc-' + a.id.replace(/[^a-zA-Z0-9_-]/g, '_');
            const cp = el('clipPath', { id: clipPathId });
            const topPad = a.kind === 'service-task' ? 22 : 4;
            cp.appendChild(el('rect', {
                x: a.x + 4, y: a.y + topPad,
                width: a.width - 8, height: a.height - topPad - 4,
            }));
            defs.appendChild(cp);
        }

        // Label
        if (a.label) {
            const isFloatingLabel = a.kind === 'gateway-exclusive' ||
                a.kind === 'start' || a.kind === 'end' || a.kind === 'end-cancel' ||
                a.kind.startsWith('intermediate');
            const labelY = isFloatingLabel ? a.y + a.height + 10 : cy;
            const labelWidth = isFloatingLabel ? Math.max(a.width, 60) : a.width - 8;
            const maxLines = isFloatingLabel ? 3 : 4;
            const tx = el('text', { x: cx, y: labelY, class: 'node-label' });
            wrapText(tx, a.label, labelWidth, maxLines);
            if (clipPathId) {
                tx.setAttribute('clip-path', 'url(#' + clipPathId + ')');
            }
            g.appendChild(tx);
        }

        // Title tooltip
        const title = el('title');
        let tooltipText = a.label + ' [' + a.id + ']';
        if (a.managerMechanism) {
            tooltipText += '\\n' + a.managerMechanism;
            if (a.roleId) tooltipText += ' · ' + a.roleId;
            if (a.groupId) tooltipText += ' · ' + a.groupId;
        }
        if (a.scriptFileName) tooltipText += '\\n📜 ' + a.scriptFileName;
        if (a.process) tooltipText += '\\n📋 ' + a.process;
        if (hasError || hasWarning) {
            const issueText = issues.map(i => (i.severity === 'error' ? '✗ ' : '⚠ ') + i.message).join('\\n');
            tooltipText += '\\n' + issueText;
        }
        title.textContent = tooltipText;
        g.appendChild(title);

        // Validation dot badge (top-right corner)
        if (hasError || hasWarning) {
            const isCircular = a.kind === 'start' || a.kind === 'end' || a.kind === 'end-cancel' || a.kind.startsWith('intermediate');
            const dotX = isCircular ? cx + Math.min(a.width, a.height) / 2 - 3 : a.x + a.width - 7;
            const dotY = isCircular ? cy - Math.min(a.width, a.height) / 2 + 3 : a.y + 7;
            const dot = el('circle', {
                cx: dotX, cy: dotY, r: 5,
                fill: hasError ? '#d32f2f' : '#f57f17',
                class: 'issue-dot',
            });
            const dotText = el('text', {
                x: dotX, y: dotY,
                'font-size': 7,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                fill: 'white',
                class: 'issue-dot',
            });
            dotText.textContent = String(issues.length);
            g.appendChild(dot);
            g.appendChild(dotText);
        }

        // Click — select and show property panel
        g.addEventListener('click', (ev) => {
            ev.stopPropagation();
            document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
            g.classList.add('selected');
            selectedActivity = a;
            showPropertyPanel(a);
        });

        svg.appendChild(g);
    }

    // ── Property panel ──────────────────────────────────────────────────
    function showPropertyPanel(a) {
        const issues = VALIDATION_ISSUES[a.id] || [];
        document.getElementById('prop-id').textContent = a.id;
        document.getElementById('prop-kind').textContent = kindLabel(a.kind);
        document.getElementById('prop-name').value = a.label || '';

        const rowScript = document.getElementById('row-script');
        const propScript = document.getElementById('prop-script');
        const btnOpenScript = document.getElementById('btn-open-script');
        if (a.kind === 'service-task') {
            rowScript.hidden = false;
            propScript.value = a.scriptFileName || '';
            btnOpenScript.hidden = !a.scriptFileName;
        } else {
            rowScript.hidden = true;
            btnOpenScript.hidden = true;
        }

        const rowMechanism = document.getElementById('row-mechanism');
        const propMechanism = document.getElementById('prop-mechanism');
        if (a.managerMechanism) {
            rowMechanism.hidden = false;
            propMechanism.textContent = a.managerMechanism;
        } else {
            rowMechanism.hidden = true;
        }

        const rowRole = document.getElementById('row-role');
        const propRole = document.getElementById('prop-role');
        const roleVal = a.roleId || a.groupId || '';
        if (roleVal) {
            rowRole.hidden = false;
            propRole.textContent = roleVal;
        } else {
            rowRole.hidden = true;
        }

        const rowIssues = document.getElementById('row-issues');
        if (issues.length > 0) {
            rowIssues.hidden = false;
            rowIssues.innerHTML = issues.map(i =>
                '<div class="issue-item ' + i.severity + '">' + escHtml(i.message) + '</div>'
            ).join('');
        } else {
            rowIssues.hidden = true;
        }

        const btnOpenSub = document.getElementById('btn-open-subprocess');
        btnOpenSub.hidden = !(a.kind === 'subprocess' && a.process);

        propertyPanel.classList.remove('panel-hidden');
    }

    function hidePropertyPanel() {
        propertyPanel.classList.add('panel-hidden');
        document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
        selectedActivity = null;
    }

    function kindLabel(kind) {
        const labels = {
            'start': 'Início', 'end': 'Fim', 'end-cancel': 'Fim (Cancelar)',
            'task': 'Tarefa', 'service-task': 'Service Task', 'subprocess': 'Sub-processo',
            'gateway-exclusive': 'Gateway Exclusivo',
            'intermediate-link-throw': 'Link (Enviar)', 'intermediate-link-receive': 'Link (Receber)',
            'intermediate-error': 'Erro Intermediário',
        };
        return labels[kind] || kind;
    }

    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.getElementById('btn-panel-close').addEventListener('click', hidePropertyPanel);

    document.getElementById('btn-save-props').addEventListener('click', () => {
        if (!selectedActivity) return;
        const patch = { id: selectedActivity.id };
        const newName = document.getElementById('prop-name').value.trim();
        if (newName !== (selectedActivity.label || '')) {
            patch.name = newName;
        }
        if (selectedActivity.kind === 'service-task') {
            const newScript = document.getElementById('prop-script').value.trim();
            if (newScript !== (selectedActivity.scriptFileName || '')) {
                patch.scriptFileName = newScript;
            }
        }
        if (Object.keys(patch).length > 1) {
            vscode.postMessage({ type: 'patchActivity', patch });
        }
    });

    document.getElementById('btn-open-script').addEventListener('click', () => {
        if (selectedActivity && selectedActivity.scriptFileName) {
            vscode.postMessage({ type: 'openScript', scriptFileName: selectedActivity.scriptFileName });
        }
    });

    document.getElementById('btn-open-subprocess').addEventListener('click', () => {
        if (selectedActivity && selectedActivity.process) {
            vscode.postMessage({ type: 'openSubProcess', processId: selectedActivity.process });
        }
    });

    // Click on canvas background deselects
    svg.addEventListener('click', () => {
        hidePropertyPanel();
    });

    // Wrap multi-line text
    function wrapText(textEl, text, maxWidth, maxLines) {
        const x = textEl.getAttribute('x');
        const y = parseFloat(textEl.getAttribute('y'));
        textEl.textContent = '';
        const words = String(text || '').split(/\\s+/);
        const lines = [];
        let line = '';
        const charBudget = Math.max(6, Math.floor(maxWidth / 6));
        for (const w of words) {
            if ((line + ' ' + w).trim().length > charBudget && line) {
                lines.push(line);
                line = w;
            } else {
                line = line ? line + ' ' + w : w;
            }
        }
        if (line) lines.push(line);
        const cap = maxLines || lines.length;
        const display = lines.slice(0, cap);
        if (lines.length > cap && display.length > 0) {
            const last = display[display.length - 1];
            display[display.length - 1] = (last.length > 1 ? last.slice(0, -1) : last) + '\\u2026';
        }
        const lineH = 12;
        const start = y - ((display.length - 1) * lineH) / 2;
        for (let i = 0; i < display.length; i++) {
            const tspan = document.createElementNS(NS, 'tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('y', String(start + i * lineH));
            tspan.textContent = display[i];
            textEl.appendChild(tspan);
        }
    }

    // Initial viewport
    applyViewBox();

    // ── Pan & zoom ──────────────────────────────────────────────────────
    wrapper.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('#property-panel')) return;
        panning = true;
        panStart = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
        wrapper.classList.add('panning');
    });
    window.addEventListener('mousemove', (e) => {
        if (!panning || !panStart) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        viewBox.x = panStart.vbX - (e.clientX - panStart.x) * scaleX;
        viewBox.y = panStart.vbY - (e.clientY - panStart.y) * scaleY;
        applyViewBox();
    });
    window.addEventListener('mouseup', () => {
        panning = false;
        panStart = null;
        wrapper.classList.remove('panning');
    });
    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        const px = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
        const py = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;
        zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, px, py);
    }, { passive: false });

    document.getElementById('btn-fit').addEventListener('click', fit);
    document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(1.25));
    document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(1 / 1.25));

    // Enter on name/script input triggers save
    ['prop-name', 'prop-script'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('btn-save-props').click();
            });
        }
    });
})();
`;
