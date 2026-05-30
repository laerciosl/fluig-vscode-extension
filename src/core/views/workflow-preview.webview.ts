import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { parseProcess } from '../../fluig/workflow/process/process.parser';
import { buildRenderModel, RenderModel, RenderNode } from '../../fluig/workflow/process/process-to-render.mapper';
import { validateProcessDefinition, ValidationIssue } from '../../fluig/workflow/process/process.validator';
import { patchActivityName, patchActivityScriptFileName } from '../../fluig/workflow/process/process.patcher';
import { extractEmfDiagram } from '../../fluig/workflow/process/process.emf-parser';
import { ProcessGraph } from '../../fluig/workflow/process/process.graph';
import type { ActivityKind } from '../../fluig/workflow/process/process.types';
import type { GatewayConditionInput } from '../../fluig/workflow/process/process.graph';
import { convertProcessToBpmn } from '../../fluig/workflow/process/process-to-bpmn.mapper';
import { CANONICAL_ACTIVITY_BOUNDS } from '../../fluig/workflow/process/process-canonical-bounds';
import { apiFindGroups, apiFindRoles } from '@fluiggers/sdk';
import type { OrgGroupDTO, OrgRoleDTO } from '@fluiggers/sdk';
import { getRuntime } from '../runtime-state';
import { createLogger } from '../logger';

const log = createLogger('[PROCESS]');

const panels = new Map<string, WorkflowPreviewPanel>();

/** URI da extensão, para resolver assets do webview (bpmn-js). */
let extensionUri: vscode.Uri | undefined;

export function initWorkflowPreview(uri: vscode.Uri): void {
    extensionUri = uri;
}

function getPreviewEngine(): 'svg' | 'bpmn' {
    return vscode.workspace
        .getConfiguration('fluiggers')
        .get<'svg' | 'bpmn'>('workflowPreview.engine', 'svg');
}

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
    private groups: OrgGroupDTO[] = [];
    private roles: OrgRoleDTO[] = [];
    /** Engine atualmente renderizado no webview; permite atualização incremental no bpmn. */
    private renderedEngine?: 'svg' | 'bpmn';
    /** Debounce de commit: agrupa várias edições (Save/append) num único write+refresh. */
    private commitTimer?: ReturnType<typeof setTimeout>;

    constructor(private readonly processUri: vscode.Uri) {
        this.panel = vscode.window.createWebviewPanel(
            'fluigWorkflowPreview',
            this.buildTitle(),
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: extensionUri
                    ? [vscode.Uri.joinPath(extensionUri, 'dist')]
                    : undefined,
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
        // Garante que uma edição pendente no debounce não se perca ao fechar o painel.
        if (this.commitTimer) {
            clearTimeout(this.commitTimer);
            this.commitTimer = undefined;
            void vscode.workspace.fs.writeFile(this.processUri, Buffer.from(this.currentXml, 'utf-8'));
        }
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

        this.panel.title = `Preview: ${def.metadata.name || def.metadata.id}`;

        if (getPreviewEngine() === 'bpmn') {
            let emf;
            try {
                emf = extractEmfDiagram(xml);
            } catch {
                emf = undefined; // sem pictograma → fluxos em linha reta
            }
            const conv = convertProcessToBpmn(def, emf);
            const model = buildRenderModel(def);
            const nodes: Record<string, RenderNode> = {};
            for (const node of model.activities) {
                nodes[node.id] = node;
            }
            const issues = validateProcessDefinition(def, { processFsPath: this.processUri.fsPath });
            const issuesByBpmnId = buildIssuesByBpmnId(issues, conv.fluigToId);
            if (this.renderedEngine === 'bpmn') {
                // Webview já vivo: atualiza no lugar sem recriar o HTML (preserva zoom/seleção).
                this.panel.webview.postMessage({
                    type: 'updateModel',
                    xml: conv.xml,
                    idToFluig: conv.idToFluig,
                    nodes,
                    issuesByBpmnId,
                    formName: model.formName ?? '',
                });
            } else {
                this.panel.webview.html = renderBpmnHtml(conv.xml, this.panel.webview, {
                    idToFluig: conv.idToFluig,
                    nodes,
                    groups: this.groups,
                    roles: this.roles,
                    formName: model.formName,
                    issuesByBpmnId,
                });
                this.renderedEngine = 'bpmn';
            }
            log.debug(`Preview (bpmn) refresh: ${def.metadata.id} (${def.activities.length} atividades)`);
            if (conv.losses.length) {
                log.debug(`Conversão BPMN — perdas conhecidas: ${conv.losses.join('; ')}`);
            }
            return;
        }

        const model = buildRenderModel(def);
        const issues = validateProcessDefinition(def, { processFsPath: this.processUri.fsPath });
        this.panel.webview.html = renderModelHtml(model, issues, this.groups, this.roles);
        this.renderedEngine = 'svg';
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
            case 'openForm':
                await this.openForm(message.formName);
                break;
            case 'loadOrgChart':
                await this.handleLoadOrgChart();
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
                this.currentXml = xml;
                this.scheduleCommit();
                break;
            }
            case 'addNode': {
                const newId = this.applyGraphOp(g =>
                    g.addNode(message.kind, message.name, { x: message.x, y: message.y })
                );
                if (newId && message.tempId) {
                    // Permite ao webview ligar uma conexão pendente (append) ao novo nó.
                    this.panel.webview.postMessage({
                        type: 'nodeCreated',
                        tempId: message.tempId,
                        fluigId: newId,
                    });
                }
                break;
            }
            case 'removeNode':
                this.applyGraphOp(g => g.removeNode(message.id));
                break;
            case 'moveNode':
                this.applyGraphOp(g => {
                    // bpmn-js manda top-left CANÔNICO (mapper emitiu bounds canônicos
                    // centrados no centro original). Pra escrever no `.process` precisamos
                    // do top-left ORIGINAL (Graphiti), preservando o centro:
                    //   sh.x + canonW/2 = origX + origW/2
                    // ⇒ origX = sh.x + (canonW - origW)/2  (idem Y).
                    const activity = g.def.activities.find(a => a.id === message.id);
                    if (!activity?.coords) {
                        g.moveNode(message.id, message.x, message.y);
                        return;
                    }
                    const canon = CANONICAL_ACTIVITY_BOUNDS[activity.kind];
                    const origX = Math.round(message.x + (canon.width - activity.coords.width) / 2);
                    const origY = Math.round(message.y + (canon.height - activity.coords.height) / 2);
                    g.moveNode(message.id, origX, origY);
                });
                break;
            case 'connectNodes':
                this.applyGraphOp(g => g.connect(message.sourceId, message.targetId));
                break;
            case 'disconnectFlow':
                this.applyGraphOp(g => g.disconnect(message.flowId));
                break;
            case 'updateAssignment':
                this.applyGraphOp(g =>
                    g.updateAssignment(message.id, message.mechanism, message.roleId, message.groupId)
                );
                break;
            case 'updateConditions':
                this.applyGraphOp(g =>
                    g.updateGatewayConditions(message.id, message.conditions as GatewayConditionInput[])
                );
                break;
            case 'updateSla':
                this.applyGraphOp(g => g.updateSla(message.id, message.expediente));
                break;
            case 'updateAnnotation':
                this.applyGraphOp(g => g.updateAnnotation(message.id, message.text));
                break;
        }
    }

    /**
     * Aplica uma operação de grafo ao XML em memória e agenda o commit (debounce).
     * Síncrono: várias ops de um mesmo Save/append acumulam em `currentXml` e
     * resultam num único write+refresh, sem race de re-parse do disco.
     */
    private applyGraphOp<T>(op: (graph: ProcessGraph) => T): T | undefined {
        try {
            const def = parseProcess(this.currentXml);
            const emf = extractEmfDiagram(this.currentXml);
            const graph = ProcessGraph.from(def, emf);
            const result = op(graph);
            this.currentXml = graph.serialize();
            this.scheduleCommit();
            return result;
        } catch (err: any) {
            vscode.window.showErrorMessage(`Erro ao editar processo: ${err.message}`);
            return undefined;
        }
    }

    private scheduleCommit(): void {
        if (this.commitTimer) { clearTimeout(this.commitTimer); }
        this.postSaveStatus('saving');
        this.commitTimer = setTimeout(() => {
            this.commitTimer = undefined;
            void this.commit();
        }, 120);
    }

    private async commit(): Promise<void> {
        try {
            await vscode.workspace.fs.writeFile(this.processUri, Buffer.from(this.currentXml, 'utf-8'));
            await this.refresh();
            this.postSaveStatus('saved');
        } catch (err: any) {
            this.postSaveStatus('error', err.message);
            vscode.window.showErrorMessage(`Erro ao salvar .process: ${err.message}`);
        }
    }

    /** Único ponto de transição do indicador "Salvando…/Salvo/Erro" da toolbar. */
    private postSaveStatus(status: 'saving' | 'saved' | 'error', message?: string): void {
        this.panel.webview.postMessage({ type: 'saveStatus', status, message });
    }

    private async handleLoadOrgChart(): Promise<void> {
        const server = getRuntime().activeServer;
        if (!server) {
            this.panel.webview.postMessage({ type: 'orgChartLoaded', groups: [], roles: [], error: 'Sem servidor conectado.' });
            return;
        }
        try {
            const [groups, roles] = await Promise.all([
                apiFindGroups(server),
                apiFindRoles(server),
            ]);
            this.groups = groups;
            this.roles = roles;
            log.info(`Orgchart carregado: ${groups.length} grupos, ${roles.length} papéis`);
            this.panel.webview.postMessage({ type: 'orgChartLoaded', groups, roles });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error(`Orgchart indisponível (${server.host}): ${msg}`);
            this.panel.webview.postMessage({ type: 'orgChartLoaded', groups: [], roles: [], error: msg });
        }
    }

    private async openScript(scriptFileName: string): Promise<void> {
        const scriptUri = resolveScriptUri(this.processUri.fsPath, scriptFileName);
        if (!scriptUri) {
            vscode.window.showWarningMessage(
                `Script "${scriptFileName}" não encontrado em workflow/scripts/. Importe-o do Fluig primeiro.`
            );
            return;
        }
        await vscode.window.showTextDocument(scriptUri, { viewColumn: vscode.ViewColumn.One });
    }

    private async openSubProcess(processId: string): Promise<void> {
        const candidate = resolveSubProcessUri(this.processUri.fsPath, processId);
        if (!candidate) {
            vscode.window.showWarningMessage(
                `Sub-processo "${processId}.process" não encontrado em workflow/.`
            );
            return;
        }
        openWorkflowPreview(candidate);
    }

    private async openForm(formName: string): Promise<void> {
        const formUri = resolveFormUri(this.processUri.fsPath, formName);
        if (!formUri) {
            vscode.window.showWarningMessage(
                `Formulário "${formName}" não encontrado no workspace (procurado em forms/${formName}/ e ${formName}.form).`
            );
            return;
        }
        const stat = await vscode.workspace.fs.stat(formUri).then(() => true, () => false);
        if (!stat) {
            vscode.window.showWarningMessage(`Formulário "${formName}" não encontrado.`);
            return;
        }
        await vscode.commands.executeCommand('revealInExplorer', formUri);
    }
}

function resolveFormUri(processFsPath: string, formName: string): vscode.Uri | undefined {
    let dir = dirname(processFsPath);
    for (let i = 0; i < 5; i++) {
        const candidates = [
            join(dir, 'forms', formName),
            join(dir, 'forms', `${formName}.form`),
            join(dir, `${formName}.form`),
        ];
        for (const c of candidates) {
            if (existsSync(c)) { return vscode.Uri.file(c); }
        }
        const parent = dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}

/**
 * Resolve `workflow/scripts/<scriptFileName>` subindo até 5 níveis a partir
 * do `.process`. Necessário porque o `.process` pode estar mais fundo
 * (ex.: `workflow/diagrams/X.process`) enquanto a pasta `scripts/` continua
 * em `workflow/`. Mesmo padrão de `resolveFormUri`.
 */
function resolveScriptUri(processFsPath: string, scriptFileName: string): vscode.Uri | undefined {
    let dir = dirname(processFsPath);
    for (let i = 0; i < 5; i++) {
        const candidate = join(dir, 'scripts', scriptFileName);
        if (existsSync(candidate)) { return vscode.Uri.file(candidate); }
        const parent = dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}

/** Resolve `<processId>.process` ao lado do `.process` atual, subindo até 5 níveis. */
function resolveSubProcessUri(processFsPath: string, processId: string): vscode.Uri | undefined {
    const fileName = `${processId}.process`;
    let dir = dirname(processFsPath);
    for (let i = 0; i < 5; i++) {
        const candidate = join(dir, fileName);
        if (existsSync(candidate)) { return vscode.Uri.file(candidate); }
        const parent = dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}

// ── Messages ──────────────────────────────────────────────────────────────

type PreviewMessage =
    | { type: 'openScript'; scriptFileName: string }
    | { type: 'openSubProcess'; processId: string }
    | { type: 'openForm'; formName: string }
    | { type: 'loadOrgChart' }
    | { type: 'patchActivity'; patch: { id: string; name?: string; scriptFileName?: string } }
    | { type: 'addNode'; kind: ActivityKind; name: string; x: number; y: number; tempId?: string }
    | { type: 'removeNode'; id: string }
    | { type: 'moveNode'; id: string; x: number; y: number }
    | { type: 'connectNodes'; sourceId: string; targetId: string }
    | { type: 'disconnectFlow'; flowId: string }
    | { type: 'updateAssignment'; id: string; mechanism: string; roleId?: string; groupId?: string }
    | { type: 'updateConditions'; id: string; conditions: Array<{ expression: string; targetTaskId: string }> }
    | { type: 'updateSla'; id: string; expediente: string }
    | { type: 'updateAnnotation'; id: string; text: string };

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

// ── bpmn-js (engine experimental) ───────────────────────────────────────────

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

interface BpmnViewData {
    idToFluig: Record<string, string>;
    nodes: Record<string, RenderNode>;
    groups: OrgGroupDTO[];
    roles: OrgRoleDTO[];
    formName?: string;
    issuesByBpmnId: Record<string, { message: string; severity: string }[]>;
}

function renderBpmnHtml(bpmnXml: string, webview: vscode.Webview, data: BpmnViewData): string {
    if (!extensionUri) {
        return renderErrorHtml('Assets do bpmn-js indisponíveis (extensão não inicializada).');
    }
    const root = extensionUri;
    const bpmnCss = webview.asWebviewUri(vscode.Uri.joinPath(root, 'dist', 'libs', 'bpmn', 'bpmn.css')).toString();
    const editorJs = webview.asWebviewUri(vscode.Uri.joinPath(root, 'dist', 'views', 'bpmn-editor.js')).toString();
    const nonce = getNonce();
    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} data:`,
        `script-src ${webview.cspSource} 'nonce-${nonce}'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource} data:`,
    ].join('; ');
    const initialData = {
        xml: bpmnXml,
        idToFluig: data.idToFluig,
        nodes: data.nodes,
        groups: data.groups,
        roles: data.roles,
        formName: data.formName ?? '',
        issuesByBpmnId: data.issuesByBpmnId,
    };
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<link rel="stylesheet" href="${bpmnCss}"/>
<style nonce="${nonce}">
    ${STYLES}
    html, body { display: flex; flex-direction: column; }
    .bpmn-toolbar {
        display: flex; align-items: center; justify-content: flex-end;
        padding: 4px 12px; height: 28px; box-sizing: border-box; flex-shrink: 0;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
    }
    #save-status {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 2px 10px; border-radius: 10px;
        font-size: 11px; font-weight: 500; line-height: 1;
        transition: background 0.15s ease, color 0.15s ease;
    }
    #save-status.status-saving { background: #fff4d6; color: #b07000; }
    #save-status.status-saved  { background: #d8f5d4; color: #2e7d32; }
    #save-status.status-error  { background: #ffd5d5; color: #b00020; }
    @keyframes save-status-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    #save-status.status-saving::before {
        content: '●'; animation: save-status-pulse 1s ease-in-out infinite;
    }
    .main-area { display: flex; flex: 1; overflow: hidden; }
    #bpmn-canvas { flex: 1; height: 100%; position: relative; background: #fff; overflow: hidden; }
    /* Halo branco atrás dos labels → legíveis mesmo sobre arestas (igual ao SVG). */
    .djs-label { font-family: Arial, sans-serif; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
    #bpmn-error { font-family: var(--vscode-font-family); color: #b00020; padding: 16px; white-space: pre-wrap; }
</style>
</head>
<body>
    <header class="bpmn-toolbar">
        <span id="save-status" class="status-saved" title="Edições do preview salvam automaticamente no .process">✓ Salvo</span>
    </header>
    <div class="main-area">
        <div id="bpmn-canvas"></div>
        ${PROPERTY_PANEL_HTML}
    </div>
    <div id="bpmn-error" hidden></div>
    <script nonce="${nonce}">window.__BPMN_DATA__ = ${JSON.stringify(initialData)};</script>
    <script src="${editorJs}" nonce="${nonce}"></script>
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

/** Indexa os issues por id do elemento BPMN (para overlays no engine bpmn). */
function buildIssuesByBpmnId(
    issues: ValidationIssue[],
    fluigToId: Record<string, string>
): Record<string, { message: string; severity: string }[]> {
    const map: Record<string, { message: string; severity: string }[]> = {};
    for (const issue of issues) {
        if (!issue.targetId) { continue; }
        const bpmnId = fluigToId[issue.targetId];
        if (!bpmnId) { continue; }
        if (!map[bpmnId]) { map[bpmnId] = []; }
        map[bpmnId].push({ message: issue.message, severity: issue.severity });
    }
    return map;
}

// Marcação do painel de propriedades, compartilhada entre os engines svg e bpmn.
const PROPERTY_PANEL_HTML = /* html */ `<aside id="property-panel" class="panel-hidden">
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
                <div class="field-row" id="row-assignment">
                    <label class="field-label">Mecanismo</label>
                    <select id="prop-mechanism-select" class="field-input">
                        <option value="Papel">Papel</option>
                        <option value="Pool Papel">Pool Papel</option>
                        <option value="Grupo">Grupo</option>
                        <option value="Pool Grupo">Pool Grupo</option>
                    </select>
                </div>
                <div class="field-row" id="row-role-input">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <label class="field-label" id="lbl-role-input">Papel/Grupo</label>
                        <button id="btn-load-orgchart" class="btn-secondary" style="font-size:10px;padding:1px 6px" title="Carregar lista do servidor Fluig">Carregar</button>
                    </div>
                    <input id="prop-role-input" type="text" class="field-input" placeholder="id do papel ou grupo"/>
                    <select id="prop-role-select" class="field-input" hidden></select>
                </div>
                <div class="field-row" id="row-sla">
                    <label class="field-label">Expediente (SLA)</label>
                    <input id="prop-sla" type="text" class="field-input" placeholder="ex: Default, 8h"/>
                </div>
                <div id="row-conditions" hidden>
                    <div class="field-label" style="margin-bottom:4px">Condições de saída</div>
                    <div id="conditions-list"></div>
                    <button id="btn-add-condition" class="btn-secondary" style="margin-top:4px;font-size:11px">+ Condição</button>
                </div>
                <div id="row-issues" class="issues-list" hidden></div>
                <div id="row-form" class="field-row" hidden>
                    <label class="field-label">Formulário do Processo</label>
                    <div style="display:flex;gap:4px;align-items:center">
                        <span id="prop-form-name" class="field-readonly" style="flex:1"></span>
                        <button id="btn-open-form" class="btn-secondary" style="flex-shrink:0;font-size:11px">Abrir</button>
                    </div>
                </div>
                <div class="panel-actions">
                    <button id="btn-save-props" class="btn-primary">Salvar</button>
                    <button id="btn-open-script" hidden>Abrir Script</button>
                    <button id="btn-open-subprocess" hidden>Abrir Sub-processo</button>
                </div>
            </div>
        </aside>`;

function renderModelHtml(
    model: RenderModel,
    issues: ValidationIssue[],
    groups: OrgGroupDTO[],
    roles: OrgRoleDTO[]
): string {
    const modelJson = JSON.stringify(model);
    const issuesJson = JSON.stringify(buildIssuesMap(issues));
    const groupsJson = JSON.stringify(groups);
    const rolesJson = JSON.stringify(roles);
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
            <button id="btn-edit-mode" title="Ativar modo de edição estrutural">Editar</button>
            <span class="action-sep"></span>
            <span id="palette">
                <button class="palette-btn" data-kind="task" title="Adicionar tarefa">Tarefa</button>
                <button class="palette-btn" data-kind="service-task" title="Adicionar service task">Serviço</button>
                <button class="palette-btn" data-kind="gateway-exclusive" title="Adicionar gateway">Gateway</button>
                <button class="palette-btn" data-kind="start" title="Adicionar início">Início</button>
                <button class="palette-btn" data-kind="end" title="Adicionar fim">Fim</button>
            </span>
            <span class="action-sep" id="sep-edit"></span>
            <button id="btn-fit" title="Ajustar à tela">Fit</button>
            <button id="btn-zoom-in" title="Aumentar zoom">+</button>
            <button id="btn-zoom-out" title="Diminuir zoom">−</button>
            <span id="zoom-indicator">100%</span>
        </div>
    </header>
    <div class="main-area">
        <div id="canvas-wrapper">
            <svg id="canvas" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        ${PROPERTY_PANEL_HTML}
    </div>
    <div id="empty-hint" hidden>Nenhuma atividade encontrada.</div>
    <script>
        const MODEL = ${modelJson};
        const VALIDATION_ISSUES = ${issuesJson};
        const GROUPS = ${groupsJson};
        const ROLES = ${rolesJson};
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
.btn-secondary { font-size: 12px; font-family: inherit; padding: 4px 10px; cursor: pointer; border-radius: 3px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
.condition-row { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
.condition-row .cond-expr { flex: 2; }
.condition-row .cond-target { flex: 1; min-width: 60px; }
.condition-row .cond-remove { flex-shrink: 0; padding: 2px 6px; font-size: 13px; cursor: pointer; border: none; background: none; color: var(--vscode-errorForeground); opacity: 0.7; }
.condition-row .cond-remove:hover { opacity: 1; }
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

/* ── Edit mode ── */
.action-sep { display: inline-block; width: 1px; height: 16px; background: var(--vscode-panel-border); margin: 0 4px; vertical-align: middle; }
#btn-edit-mode { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 2px 10px; cursor: pointer; font-size: 12px; border-radius: 3px; }
#btn-edit-mode:hover { background: var(--vscode-button-secondaryHoverBackground); }
#btn-edit-mode.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
#palette { display: none; gap: 3px; align-items: center; }
#sep-edit { display: none; }
.toolbar.edit-mode #palette { display: inline-flex; }
.toolbar.edit-mode #sep-edit { display: inline-block; }
.toolbar.edit-mode { outline: 2px solid rgba(0,120,212,0.2); outline-offset: -2px; }
.palette-btn { font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.palette-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.palette-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
#canvas-wrapper.placing { cursor: crosshair; }
#canvas-wrapper.drawing-conn { cursor: crosshair; }

/* ── Connection handles ── */
.handle { fill: white; stroke: #00c853; stroke-width: 2; opacity: 0; cursor: crosshair; transition: opacity 0.12s; pointer-events: all; }
#canvas.edit-mode .node:hover .handle { opacity: 1; }
.handle:hover, .handle:active { opacity: 1 !important; fill: #00c853; }
.temp-edge { stroke: #00c853; stroke-width: 1.5; stroke-dasharray: 5 3; fill: none; pointer-events: none; }

/* ── Selectable edges ── */
.edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; pointer-events: stroke; }
.edge-group.edge-selected .edge { stroke: #d84315; stroke-width: 2.5; }
.edge-group.edge-selected .edge-label { fill: #d84315; }
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

    // ── Edit mode state ────────────────────────────────────────────
    let editMode = false;
    let placingKind = null;
    let dragging = null;         // { id, startX, startY, origX, origY, gEl }
    let drawingConnection = null; // { sourceId, tempLine }
    let selectedEdgeId = null;

    const PALETTE_LABELS = {
        'task': 'Nova Tarefa', 'service-task': 'Novo Serviço',
        'gateway-exclusive': 'Gateway', 'start': 'Início', 'end': 'Fim',
        'subprocess': 'Sub-processo',
    };

    function clientToViewBox(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        return {
            x: viewBox.x + (clientX - rect.left) * (viewBox.width / rect.width),
            y: viewBox.y + (clientY - rect.top) * (viewBox.height / rect.height),
        };
    }

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
        const edgeGroup = el('g', { class: 'edge-group', 'data-flow-id': e.id });
        edgeGroup.appendChild(el('path', { d, class: 'edge', 'marker-end': 'url(#arrow)' }));
        // Invisible wider path for click-to-select
        const hitArea = el('path', { d, class: 'edge-hit' });
        hitArea.addEventListener('click', (ev) => {
            if (!editMode) { return; }
            ev.stopPropagation();
            if (selectedEdgeId === e.id) {
                selectedEdgeId = null;
                edgeGroup.classList.remove('edge-selected');
            } else {
                if (selectedEdgeId) {
                    const prev = document.querySelector('[data-flow-id="' + selectedEdgeId + '"]');
                    if (prev) { prev.classList.remove('edge-selected'); }
                }
                selectedEdgeId = e.id;
                edgeGroup.classList.add('edge-selected');
                hidePropertyPanel();
            }
        });
        edgeGroup.appendChild(hitArea);
        if (e.label) {
            const mid = wps[Math.floor(wps.length / 2) - 1] || wps[0];
            const next = wps[Math.floor(wps.length / 2)] || wps[wps.length - 1];
            const mx = (mid.x + next.x) / 2;
            const my = (mid.y + next.y) / 2;
            const t = el('text', { x: mx, y: my - 4, class: 'edge-label' });
            t.textContent = e.label;
            edgeGroup.appendChild(t);
        }
        svg.appendChild(edgeGroup);
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
            if (drawingConnection) { return; } // handled by pointerup
            ev.stopPropagation();
            // Deselect any edge
            if (selectedEdgeId) {
                const prev = document.querySelector('[data-flow-id="' + selectedEdgeId + '"]');
                if (prev) { prev.classList.remove('edge-selected'); }
                selectedEdgeId = null;
            }
            document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
            g.classList.add('selected');
            selectedActivity = a;
            showPropertyPanel(a);
        });

        // Drag in edit mode
        g.addEventListener('pointerdown', (ev) => {
            if (!editMode || ev.button !== 0) { return; }
            if (ev.target.closest('.handle')) { return; } // handle manages its own drag
            ev.stopPropagation();
            dragging = { id: a.id, startX: ev.clientX, startY: ev.clientY,
                         origX: a.x, origY: a.y, gEl: g };
            g.setPointerCapture(ev.pointerId);
        });

        // Connection handles (visible on hover in edit mode via CSS)
        const handlePositions = [
            { x: cx,          y: a.y           }, // N
            { x: cx,          y: a.y + a.height }, // S
            { x: a.x + a.width, y: cy           }, // E
            { x: a.x,         y: cy             }, // W
        ];
        for (const hp of handlePositions) {
            const h = el('circle', { cx: hp.x, cy: hp.y, r: 6, class: 'handle' });
            h.addEventListener('pointerdown', (ev) => {
                if (!editMode) { return; }
                ev.stopPropagation();
                const tempLine = el('line', { x1: hp.x, y1: hp.y, x2: hp.x, y2: hp.y, class: 'temp-edge' });
                svg.appendChild(tempLine);
                drawingConnection = { sourceId: a.id, tempLine };
                svg.setPointerCapture(ev.pointerId);
            });
            g.appendChild(h);
        }

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

        // ── Assignment (tasks) ──────────────────────────────────────
        const rowAssignment = document.getElementById('row-assignment');
        const rowRoleInput  = document.getElementById('row-role-input');
        const rowSla        = document.getElementById('row-sla');
        const mechanismSel  = document.getElementById('prop-mechanism-select');
        const roleInput     = document.getElementById('prop-role-input');
        const roleSelect    = document.getElementById('prop-role-select');
        const lblRoleInput  = document.getElementById('lbl-role-input');
        const slaInput      = document.getElementById('prop-sla');

        const isTask = a.kind === 'task' || a.kind === 'service-task';
        rowAssignment.hidden = !isTask;
        rowRoleInput.hidden  = !isTask;
        rowSla.hidden        = !isTask;

        if (isTask) {
            const mech = a.managerMechanism || 'Papel';
            mechanismSel.value = mech;
            const isGroup = mech === 'Grupo' || mech === 'Pool Grupo';
            lblRoleInput.textContent = isGroup ? 'Grupo' : 'Papel';
            const currentVal = a.roleId || a.groupId || '';
            updateRoleControl(isGroup, currentVal);
            slaInput.value  = a.expediente || '';
        }

        // ── Gateway conditions ──────────────────────────────────────
        const rowConditions  = document.getElementById('row-conditions');
        const conditionsList = document.getElementById('conditions-list');
        rowConditions.hidden = a.kind !== 'gateway-exclusive';
        if (a.kind === 'gateway-exclusive') {
            conditionsList.innerHTML = '';
            const conds = a.conditions || [];
            for (let ci = 0; ci < conds.length; ci++) {
                conditionsList.appendChild(buildConditionRow(conds[ci].expression, conds[ci].targetTaskId));
            }
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

        // ── Formulário do processo ──────────────────────────────────
        const rowForm = document.getElementById('row-form');
        const propFormName = document.getElementById('prop-form-name');
        if (MODEL.formName) {
            propFormName.textContent = MODEL.formName;
            rowForm.hidden = false;
        } else {
            rowForm.hidden = true;
        }

        propertyPanel.classList.remove('panel-hidden');

        mechanismSel.onchange = () => {
            const isGrp = mechanismSel.value === 'Grupo' || mechanismSel.value === 'Pool Grupo';
            lblRoleInput.textContent = isGrp ? 'Grupo' : 'Papel';
            updateRoleControl(isGrp, '');
        };
    }

    function updateRoleControl(isGroup, currentVal) {
        const roleInput  = document.getElementById('prop-role-input');
        const roleSelect = document.getElementById('prop-role-select');
        const list = isGroup ? GROUPS : ROLES;

        if (list.length > 0) {
            populateRoleSelect(list, isGroup ? 'groupId' : 'roleId', isGroup ? 'groupDescription' : 'roleDescription', currentVal);
            roleInput.hidden  = true;
            roleSelect.hidden = false;
        } else {
            roleInput.placeholder = isGroup ? 'id do grupo' : 'id do papel';
            roleInput.value       = currentVal;
            roleInput.hidden  = false;
            roleSelect.hidden = true;
        }
    }

    function populateRoleSelect(list, idKey, descKey, currentVal) {
        const roleSelect = document.getElementById('prop-role-select');
        roleSelect.innerHTML = '';
        for (const item of list) {
            const opt = document.createElement('option');
            opt.value = item[idKey];
            opt.textContent = item[descKey] + ' (' + item[idKey] + ')';
            if (item[idKey] === currentVal) { opt.selected = true; }
            roleSelect.appendChild(opt);
        }
        if (currentVal && !list.some(i => i[idKey] === currentVal)) {
            const opt = document.createElement('option');
            opt.value = currentVal;
            opt.textContent = currentVal + ' (não encontrado no servidor)';
            opt.selected = true;
            roleSelect.insertBefore(opt, roleSelect.firstChild);
        }
    }

    // Recebe resposta do host com grupos/papéis carregados sob demanda
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg?.type !== 'orgChartLoaded') { return; }
        GROUPS.length = 0; GROUPS.push(...(msg.groups || []));
        ROLES.length  = 0; ROLES.push(...(msg.roles  || []));

        const btnLoad = document.getElementById('btn-load-orgchart');
        if (btnLoad) {
            btnLoad.textContent = GROUPS.length > 0 || ROLES.length > 0
                ? '✓ Carregado'
                : (msg.error ? '⚠ Sem dados' : '✓ Vazio');
            btnLoad.disabled = true;
        }

        if (selectedActivity && (selectedActivity.kind === 'task' || selectedActivity.kind === 'service-task')) {
            const mech = document.getElementById('prop-mechanism-select').value;
            const isGrp = mech === 'Grupo' || mech === 'Pool Grupo';
            const currentVal = document.getElementById('prop-role-input').value ||
                               document.getElementById('prop-role-select').value || '';
            updateRoleControl(isGrp, currentVal);
            const roleInput  = document.getElementById('prop-role-input');
            const roleSelect = document.getElementById('prop-role-select');
            if (!roleSelect.hidden) {
                roleInput.hidden  = true;
                roleSelect.hidden = false;
            }
        }
    });

    function buildConditionRow(expr, target) {
        const row = document.createElement('div');
        row.className = 'condition-row';
        const exprInp   = document.createElement('input');
        exprInp.className   = 'cond-expr field-input';
        exprInp.placeholder = 'expressão JavaScript';
        exprInp.value       = expr || '';
        const targetInp = document.createElement('input');
        targetInp.className   = 'cond-target field-input';
        targetInp.placeholder = 'id da task alvo';
        targetInp.value       = target || '';
        const removeBtn = document.createElement('button');
        removeBtn.className   = 'cond-remove';
        removeBtn.textContent = '×';
        removeBtn.title       = 'Remover condição';
        removeBtn.onclick     = () => row.remove();
        row.appendChild(exprInp);
        row.appendChild(targetInp);
        row.appendChild(removeBtn);
        return row;
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
        const a = selectedActivity;
        const id = a.id;

        // Nome e script (patchActivity — patching cirúrgico como antes)
        const patch = { id };
        const newName = document.getElementById('prop-name').value.trim();
        if (newName !== (a.label || '')) { patch.name = newName; }
        if (a.kind === 'service-task') {
            const newScript = document.getElementById('prop-script').value.trim();
            if (newScript !== (a.scriptFileName || '')) { patch.scriptFileName = newScript; }
        }
        if (Object.keys(patch).length > 1) {
            vscode.postMessage({ type: 'patchActivity', patch });
        }

        // Assignment (tasks/service-tasks)
        const isTask = a.kind === 'task' || a.kind === 'service-task';
        if (isTask) {
            const mechanism   = document.getElementById('prop-mechanism-select').value;
            const roleSelect  = document.getElementById('prop-role-select');
            const roleInput   = document.getElementById('prop-role-input');
            const roleVal     = (!roleSelect.hidden ? roleSelect.value : roleInput.value).trim();
            const isGroup     = mechanism === 'Grupo' || mechanism === 'Pool Grupo';
            const roleId    = isGroup ? undefined : (roleVal || undefined);
            const groupId   = isGroup ? (roleVal || undefined) : undefined;
            if (mechanism !== (a.managerMechanism || 'Papel') || roleVal !== (a.roleId || a.groupId || '')) {
                vscode.postMessage({ type: 'updateAssignment', id, mechanism, roleId, groupId });
            }
            const newSla = document.getElementById('prop-sla').value.trim();
            if (newSla !== (a.expediente || '')) {
                vscode.postMessage({ type: 'updateSla', id, expediente: newSla });
            }
        }

        // Gateway conditions
        if (a.kind === 'gateway-exclusive') {
            const rows = document.getElementById('conditions-list').querySelectorAll('.condition-row');
            const conditions = Array.from(rows).map(row => ({
                expression: row.querySelector('.cond-expr').value.trim(),
                targetTaskId: row.querySelector('.cond-target').value.trim(),
            })).filter(c => c.expression && c.targetTaskId);
            vscode.postMessage({ type: 'updateConditions', id, conditions });
        }
    });

    document.getElementById('btn-add-condition').addEventListener('click', () => {
        const list = document.getElementById('conditions-list');
        list.appendChild(buildConditionRow('', ''));
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

    document.getElementById('btn-open-form').addEventListener('click', () => {
        if (MODEL.formName) {
            vscode.postMessage({ type: 'openForm', formName: MODEL.formName });
        }
    });

    document.getElementById('btn-load-orgchart').addEventListener('click', () => {
        const btn = document.getElementById('btn-load-orgchart');
        btn.textContent = '...';
        btn.disabled = true;
        vscode.postMessage({ type: 'loadOrgChart' });
    });

    // Click on canvas background: place node or deselect
    svg.addEventListener('click', (e) => {
        if (placingKind) {
            const pos = clientToViewBox(e.clientX, e.clientY);
            vscode.postMessage({ type: 'addNode', kind: placingKind,
                name: PALETTE_LABELS[placingKind] || placingKind,
                x: Math.round(pos.x), y: Math.round(pos.y) });
            document.querySelectorAll('.palette-btn.active').forEach(b => b.classList.remove('active'));
            placingKind = null;
            wrapper.classList.remove('placing');
            return;
        }
        hidePropertyPanel();
        if (selectedEdgeId) {
            const prev = document.querySelector('[data-flow-id="' + selectedEdgeId + '"]');
            if (prev) { prev.classList.remove('edge-selected'); }
            selectedEdgeId = null;
        }
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
        if (editMode && e.target.closest('.node')) return; // node handles its own drag
        if (editMode && e.target.closest('.handle')) return;
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

    window.addEventListener('pointermove', (e) => {
        if (dragging) {
            const rect = svg.getBoundingClientRect();
            const scaleX = viewBox.width / rect.width;
            const scaleY = viewBox.height / rect.height;
            const dx = (e.clientX - dragging.startX) * scaleX;
            const dy = (e.clientY - dragging.startY) * scaleY;
            dragging.gEl.setAttribute('transform', 'translate(' + dx + ',' + dy + ')');
        }
        if (drawingConnection) {
            const pos = clientToViewBox(e.clientX, e.clientY);
            drawingConnection.tempLine.setAttribute('x2', String(pos.x));
            drawingConnection.tempLine.setAttribute('y2', String(pos.y));
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (dragging) {
            const { id, gEl, origX, origY, startX, startY } = dragging;
            const rect = svg.getBoundingClientRect();
            const scaleX = viewBox.width / rect.width;
            const scaleY = viewBox.height / rect.height;
            const newX = Math.round(origX + (e.clientX - startX) * scaleX);
            const newY = Math.round(origY + (e.clientY - startY) * scaleY);
            gEl.removeAttribute('transform');
            dragging = null;
            const moved = Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4;
            if (moved) {
                vscode.postMessage({ type: 'moveNode', id, x: newX, y: newY });
            }
        }
        if (drawingConnection) {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const targetNode = target && target.closest('.node');
            const targetId = targetNode ? targetNode.dataset.id : null;
            if (targetId && targetId !== drawingConnection.sourceId) {
                vscode.postMessage({ type: 'connectNodes',
                    sourceId: drawingConnection.sourceId, targetId });
            }
            drawingConnection.tempLine.remove();
            drawingConnection = null;
            wrapper.classList.remove('drawing-conn');
        }
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

    // ── Delete key ─────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
        if (!editMode) { return; }
        if (e.key !== 'Delete' && e.key !== 'Backspace') { return; }
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { return; }
        e.preventDefault();
        if (selectedActivity) {
            vscode.postMessage({ type: 'removeNode', id: selectedActivity.id });
            hidePropertyPanel();
        } else if (selectedEdgeId) {
            vscode.postMessage({ type: 'disconnectFlow', flowId: selectedEdgeId });
            const prev = document.querySelector('[data-flow-id="' + selectedEdgeId + '"]');
            if (prev) { prev.classList.remove('edge-selected'); }
            selectedEdgeId = null;
        }
    });

    // ── Edit mode toggle ────────────────────────────────────────────
    const toolbar = document.querySelector('.toolbar');
    const btnEditMode = document.getElementById('btn-edit-mode');
    btnEditMode.addEventListener('click', () => {
        editMode = !editMode;
        btnEditMode.classList.toggle('active', editMode);
        btnEditMode.textContent = editMode ? '✎ Editar' : 'Editar';
        toolbar.classList.toggle('edit-mode', editMode);
        svg.classList.toggle('edit-mode', editMode);
        if (!editMode) {
            // Cancel all active states
            placingKind = null;
            wrapper.classList.remove('placing', 'drawing-conn');
            document.querySelectorAll('.palette-btn.active').forEach(b => b.classList.remove('active'));
            if (dragging) { dragging.gEl.removeAttribute('transform'); dragging = null; }
            if (drawingConnection) { drawingConnection.tempLine.remove(); drawingConnection = null; }
            if (selectedEdgeId) {
                const prev = document.querySelector('[data-flow-id="' + selectedEdgeId + '"]');
                if (prev) { prev.classList.remove('edge-selected'); }
                selectedEdgeId = null;
            }
        }
    });

    // ── Palette buttons ─────────────────────────────────────────────
    document.querySelectorAll('.palette-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const kind = btn.dataset.kind;
            if (placingKind === kind) {
                placingKind = null;
                wrapper.classList.remove('placing');
                btn.classList.remove('active');
            } else {
                document.querySelectorAll('.palette-btn.active').forEach(b => b.classList.remove('active'));
                placingKind = kind;
                wrapper.classList.add('placing');
                btn.classList.add('active');
            }
        });
    });
})();
`;

