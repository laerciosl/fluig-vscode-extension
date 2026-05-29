/**
 * Entrypoint do webview do engine bpmn (porte 1:1 do BPMN_CLIENT_SCRIPT inline).
 *
 * Empacotado pelo webpack (target=web) para `dist/views/bpmn-editor.js`. Carrega
 * o BpmnJS Modeler com o módulo FluigRenderer (que normaliza tamanhos das formas).
 * Os dados iniciais (XML + mapas + nodes + grupos/papéis + issues) são injetados
 * pelo host em `window.__BPMN_DATA__` antes desse bundle ser avaliado.
 */
import BpmnModeler from 'bpmn-js/lib/Modeler';
import fluigRendererModule from './fluig-renderer.module';

interface OrgGroup { groupId: string; groupDescription: string; }
interface OrgRole { roleId: string; roleDescription: string; }

interface Issue { message: string; severity: string; }

interface RenderNode {
    id: string;
    kind: string;
    label?: string;
    scriptFileName?: string;
    process?: string;
    managerMechanism?: string;
    roleId?: string;
    groupId?: string;
    conditions?: Array<{ order: number; expression: string; targetTaskId: string }>;
    expediente?: string;
}

interface BpmnInitialData {
    xml: string;
    idToFluig: Record<string, string>;
    nodes: Record<string, RenderNode>;
    groups: OrgGroup[];
    roles: OrgRole[];
    formName: string;
    issuesByBpmnId: Record<string, Issue[]>;
}

declare global {
    interface Window {
        __BPMN_DATA__: BpmnInitialData;
        acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
    }
}

type HostMessage =
    | { type: 'updateModel'; xml: string; idToFluig: Record<string, string>; nodes: Record<string, RenderNode>; formName: string; issuesByBpmnId: Record<string, Issue[]> }
    | { type: 'nodeCreated'; tempId: string; fluigId: string }
    | { type: 'orgChartLoaded'; groups?: OrgGroup[]; roles?: OrgRole[]; error?: string }
    | { type: 'saveStatus'; status: 'saving' | 'saved' | 'error'; message?: string };

const DATA = window.__BPMN_DATA__;

const vscode = window.acquireVsCodeApi();
const propertyPanel = document.getElementById('property-panel')!;

let BPMN_XML = DATA.xml;
let ID_TO_FLUIG: Record<string, string> = DATA.idToFluig;
let NODES: Record<string, RenderNode> = DATA.nodes;
const GROUPS: OrgGroup[] = DATA.groups.slice();
const ROLES: OrgRole[] = DATA.roles.slice();
let FORM_NAME: string = DATA.formName || '';
let ISSUES: Record<string, Issue[]> = DATA.issuesByBpmnId;

let selectedActivity: RenderNode | null = null;
let selectedBpmnId: string | null = null;

// Reconciliação de append: nó recém-criado tem id transitório do bpmn-js até
// o host devolver o id Fluig; a conexão fica pendente até lá.
const tempToFluig: Record<string, string> = {};
const pendingConnections: Array<{ source: string; target: string }> = [];

function resolveFluig(bpmnId: string): string | null {
    return ID_TO_FLUIG[bpmnId] || tempToFluig[bpmnId] || null;
}

function tryConnect(sourceBpmnId: string, targetBpmnId: string): boolean {
    const s = resolveFluig(sourceBpmnId);
    const t = resolveFluig(targetBpmnId);
    if (s && t && s !== t) {
        vscode.postMessage({ type: 'connectNodes', sourceId: s, targetId: t });
        return true;
    }
    return false;
}

function flushPendingConnections(): void {
    for (let i = pendingConnections.length - 1; i >= 0; i--) {
        const p = pendingConnections[i];
        if (tryConnect(p.source, p.target)) { pendingConnections.splice(i, 1); }
    }
}

function showError(msg: string): void {
    const el = document.getElementById('bpmn-error')!;
    el.hidden = false;
    el.textContent = 'Falha ao renderizar BPMN:\n' + msg;
}

const modeler = new BpmnModeler({
    container: document.getElementById('bpmn-canvas')!,
    additionalModules: [fluigRendererModule],
    textRenderer: {
        defaultStyle: { fontFamily: 'Arial, sans-serif', fontSize: 11, lineHeight: 1.1 },
        externalStyle: { fontFamily: 'Arial, sans-serif', fontSize: 10, lineHeight: 1.1 },
    },
} as never);

let issueOverlayIds: string[] = [];
function applyIssueOverlays(): void {
    let overlays: any;
    let registry: any;
    try {
        overlays = modeler.get('overlays');
        registry = modeler.get('elementRegistry');
    } catch { return; }
    for (const oid of issueOverlayIds) { try { overlays.remove(oid); } catch { /* noop */ } }
    issueOverlayIds = [];
    for (const bpmnId of Object.keys(ISSUES || {})) {
        const list = ISSUES[bpmnId] || [];
        if (!list.length) { continue; }
        if (!registry.get(bpmnId)) { continue; }
        const hasError = list.some(i => i.severity === 'error');
        const color = hasError ? '#d32f2f' : '#f57f17';
        const title = list.map(i => (i.severity === 'error' ? '✗ ' : '⚠ ') + i.message).join('&#10;');
        const badge = '<div title="' + title.replace(/"/g, '&quot;') +
            '" style="background:' + color + ';color:#fff;border-radius:50%;width:16px;height:16px;' +
            'font-size:10px;line-height:16px;text-align:center;font-family:sans-serif;cursor:default;' +
            'box-shadow:0 0 0 1.5px #fff;">' + list.length + '</div>';
        try {
            const oid = overlays.add(bpmnId, { position: { top: -8, right: 8 }, html: badge });
            issueOverlayIds.push(oid);
        } catch { /* noop */ }
    }
}

modeler.importXML(BPMN_XML).then(() => {
    try { (modeler.get('canvas') as any).zoom('fit-viewport'); } catch { /* noop */ }
    applyIssueOverlays();
    const eventBus = modeler.get('eventBus') as any;
    eventBus.on('selection.changed', (e: any) => {
        const sel = (e && e.newSelection) || [];
        selectedBpmnId = sel.length ? sel[0].id : null;
        if (!sel.length) { hidePropertyPanel(); return; }
        const fluigId = ID_TO_FLUIG[sel[0].id];
        const node = fluigId ? NODES[fluigId] : null;
        if (node) { showPropertyPanel(node); } else { hidePropertyPanel(); }
    });

    eventBus.on(
        ['commandStack.elements.move.executed', 'commandStack.shape.move.executed'],
        (e: any) => {
            const ctx = (e && e.context) || {};
            const shapes = ctx.shapes || (ctx.shape ? [ctx.shape] : []);
            for (const sh of shapes) {
                if (!sh || sh.waypoints) { continue; }
                const fluigId = ID_TO_FLUIG[sh.id];
                if (!fluigId || !NODES[fluigId]) { continue; }
                // FluigRenderer normaliza só width/height — top-left fica intacto.
                // sh.x/sh.y é exatamente o top-left a persistir no .process.
                vscode.postMessage({
                    type: 'moveNode',
                    id: fluigId,
                    x: Math.round(sh.x),
                    y: Math.round(sh.y),
                });
            }
        }
    );

    eventBus.on('commandStack.shape.create.executed', (e: any) => {
        const sh = e.context && e.context.shape;
        if (!sh || sh.labelTarget) { return; }
        const kind = bpmnTypeToKind(sh.type);
        if (!kind) { return; }
        vscode.postMessage({
            type: 'addNode',
            kind,
            name: DEFAULT_NODE_NAMES[kind] || kind,
            x: Math.round(sh.x),
            y: Math.round(sh.y),
            tempId: sh.id,
        });
    });

    eventBus.on('commandStack.connection.create.executed', (e: any) => {
        const conn = e.context && e.context.connection;
        if (!conn || !conn.source || !conn.target) { return; }
        if (!tryConnect(conn.source.id, conn.target.id)) {
            pendingConnections.push({ source: conn.source.id, target: conn.target.id });
        }
    });

    // Direct-editing do bpmn-js: duplo-clique numa TextAnnotation abre o editor
    // inline; ao confirmar, dispara element.updateLabel com o novo `text` em
    // `bo.text`. Persistimos via updateAnnotation no .process.
    eventBus.on('commandStack.element.updateLabel.executed', (e: any) => {
        const el = e.context && e.context.element;
        if (!el || el.type !== 'bpmn:TextAnnotation') { return; }
        const fluigId = ID_TO_FLUIG[el.id];
        if (!fluigId) { return; }
        const text = (e.context.newLabel ?? el.businessObject?.text ?? '') as string;
        vscode.postMessage({ type: 'updateAnnotation', id: fluigId, text });
    });

    eventBus.on('commandStack.shape.delete.executed', (e: any) => {
        const sh = e.context && e.context.shape;
        if (!sh) { return; }
        const fluigId = ID_TO_FLUIG[sh.id];
        if (fluigId && NODES[fluigId]) {
            vscode.postMessage({ type: 'removeNode', id: fluigId });
        }
    });
    eventBus.on('commandStack.connection.delete.executed', (e: any) => {
        const conn = e.context && e.context.connection;
        if (!conn) { return; }
        const fluigId = ID_TO_FLUIG[conn.id];
        if (fluigId) {
            vscode.postMessage({ type: 'disconnectFlow', flowId: fluigId });
        }
    });
}).catch((err: any) => showError(err && err.message ? err.message : String(err)));

// Reimporta o modelo atualizado preservando zoom/seleção (evita "pulo" ao salvar).
// Um Save pode disparar vários updateModel; o guard coalesce para o último,
// já que importXML do bpmn-js não é reentrante.
let importing = false;
let pendingUpdate: Extract<HostMessage, { type: 'updateModel' }> | null = null;
function applyModelUpdate(msg: Extract<HostMessage, { type: 'updateModel' }>): void {
    if (importing) { pendingUpdate = msg; return; }
    importing = true;
    BPMN_XML = msg.xml;
    ID_TO_FLUIG = msg.idToFluig || {};
    NODES = msg.nodes || {};
    FORM_NAME = msg.formName || '';
    ISSUES = msg.issuesByBpmnId || {};
    let vb: any = null;
    try { vb = (modeler.get('canvas') as any).viewbox(); } catch { /* noop */ }
    const reselect = selectedBpmnId;
    modeler.importXML(msg.xml).then(() => {
        if (vb && vb.width) { try { (modeler.get('canvas') as any).viewbox(vb); } catch { /* noop */ } }
        applyIssueOverlays();
        if (reselect) {
            const el = (modeler.get('elementRegistry') as any).get(reselect);
            if (el) {
                try { (modeler.get('selection') as any).select(el); } catch { /* noop */ }
                const node = NODES[ID_TO_FLUIG[reselect]];
                if (node) { showPropertyPanel(node); }
            }
        }
    }).catch((err: any) => showError(err && err.message ? err.message : String(err)))
      .finally(() => {
        importing = false;
        if (pendingUpdate) { const m = pendingUpdate; pendingUpdate = null; applyModelUpdate(m); }
    });
}

// ── Painel de propriedades ─────────────────────────────────────────────────
function showPropertyPanel(a: RenderNode): void {
    (document.getElementById('prop-id') as HTMLElement).textContent = a.id;
    (document.getElementById('prop-kind') as HTMLElement).textContent = kindLabel(a.kind);
    (document.getElementById('prop-name') as HTMLInputElement).value = a.label || '';

    const rowScript = document.getElementById('row-script') as HTMLElement;
    const propScript = document.getElementById('prop-script') as HTMLInputElement;
    const btnOpenScript = document.getElementById('btn-open-script') as HTMLElement;
    if (a.kind === 'service-task') {
        rowScript.hidden = false;
        propScript.value = a.scriptFileName || '';
        btnOpenScript.hidden = !a.scriptFileName;
    } else {
        rowScript.hidden = true;
        btnOpenScript.hidden = true;
    }

    const rowAssignment = document.getElementById('row-assignment') as HTMLElement;
    const rowRoleInput = document.getElementById('row-role-input') as HTMLElement;
    const rowSla = document.getElementById('row-sla') as HTMLElement;
    const mechanismSel = document.getElementById('prop-mechanism-select') as HTMLSelectElement;
    const lblRoleInput = document.getElementById('lbl-role-input') as HTMLElement;
    const slaInput = document.getElementById('prop-sla') as HTMLInputElement;

    const isTask = a.kind === 'task' || a.kind === 'service-task';
    rowAssignment.hidden = !isTask;
    rowRoleInput.hidden = !isTask;
    rowSla.hidden = !isTask;
    if (isTask) {
        const mech = a.managerMechanism || 'Papel';
        mechanismSel.value = mech;
        const isGroup = mech === 'Grupo' || mech === 'Pool Grupo';
        lblRoleInput.textContent = isGroup ? 'Grupo' : 'Papel';
        updateRoleControl(isGroup, a.roleId || a.groupId || '');
        slaInput.value = a.expediente || '';
    }

    const rowConditions = document.getElementById('row-conditions') as HTMLElement;
    const conditionsList = document.getElementById('conditions-list') as HTMLElement;
    rowConditions.hidden = a.kind !== 'gateway-exclusive';
    if (a.kind === 'gateway-exclusive') {
        conditionsList.innerHTML = '';
        (a.conditions || []).forEach(c => conditionsList.appendChild(buildConditionRow(c.expression, c.targetTaskId)));
    }

    (document.getElementById('row-issues') as HTMLElement).hidden = true;

    const btnOpenSub = document.getElementById('btn-open-subprocess') as HTMLElement;
    btnOpenSub.hidden = !(a.kind === 'subprocess' && a.process);

    const rowForm = document.getElementById('row-form') as HTMLElement;
    const propFormName = document.getElementById('prop-form-name') as HTMLElement;
    if (FORM_NAME) { propFormName.textContent = FORM_NAME; rowForm.hidden = false; }
    else { rowForm.hidden = true; }

    selectedActivity = a;
    propertyPanel.classList.remove('panel-hidden');

    mechanismSel.onchange = () => {
        const isGrp = mechanismSel.value === 'Grupo' || mechanismSel.value === 'Pool Grupo';
        lblRoleInput.textContent = isGrp ? 'Grupo' : 'Papel';
        updateRoleControl(isGrp, '');
    };
}

function updateRoleControl(isGroup: boolean, currentVal: string): void {
    const roleInput = document.getElementById('prop-role-input') as HTMLInputElement;
    const roleSelect = document.getElementById('prop-role-select') as HTMLSelectElement;
    const list: Array<Record<string, string>> = isGroup ? (GROUPS as any) : (ROLES as any);
    if (list.length > 0) {
        populateRoleSelect(list, isGroup ? 'groupId' : 'roleId', isGroup ? 'groupDescription' : 'roleDescription', currentVal);
        roleInput.hidden = true; roleSelect.hidden = false;
    } else {
        roleInput.placeholder = isGroup ? 'id do grupo' : 'id do papel';
        roleInput.value = currentVal;
        roleInput.hidden = false; roleSelect.hidden = true;
    }
}

function populateRoleSelect(list: Array<Record<string, string>>, idKey: string, descKey: string, currentVal: string): void {
    const roleSelect = document.getElementById('prop-role-select') as HTMLSelectElement;
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

function buildConditionRow(expr: string, target: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'condition-row';
    const exprInp = document.createElement('input');
    exprInp.className = 'cond-expr field-input';
    exprInp.placeholder = 'expressão JavaScript';
    exprInp.value = expr || '';
    const targetInp = document.createElement('input');
    targetInp.className = 'cond-target field-input';
    targetInp.placeholder = 'id da task alvo';
    targetInp.value = target || '';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'cond-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remover condição';
    removeBtn.onclick = () => row.remove();
    row.appendChild(exprInp); row.appendChild(targetInp); row.appendChild(removeBtn);
    return row;
}

function hidePropertyPanel(): void {
    propertyPanel.classList.add('panel-hidden');
    selectedActivity = null;
}

function kindLabel(kind: string): string {
    const labels: Record<string, string> = {
        'start': 'Início', 'end': 'Fim', 'end-cancel': 'Fim (Cancelar)',
        'task': 'Tarefa', 'service-task': 'Service Task', 'subprocess': 'Sub-processo',
        'gateway-exclusive': 'Gateway Exclusivo',
        'intermediate-link-throw': 'Link (Enviar)', 'intermediate-link-receive': 'Link (Receber)',
        'intermediate-error': 'Erro Intermediário',
    };
    return labels[kind] || kind;
}

const DEFAULT_NODE_NAMES: Record<string, string> = {
    'task': 'Nova Tarefa', 'service-task': 'Novo Serviço', 'gateway-exclusive': 'Gateway',
    'start': 'Início', 'end': 'Fim', 'subprocess': 'Sub-processo',
};

function bpmnTypeToKind(type: string): string | null {
    switch (type) {
        case 'bpmn:StartEvent': return 'start';
        case 'bpmn:EndEvent': return 'end';
        case 'bpmn:ExclusiveGateway':
        case 'bpmn:Gateway':
        case 'bpmn:ParallelGateway':
        case 'bpmn:InclusiveGateway':
        case 'bpmn:EventBasedGateway': return 'gateway-exclusive';
        case 'bpmn:ServiceTask':
        case 'bpmn:ScriptTask':
        case 'bpmn:SendTask':
        case 'bpmn:ReceiveTask':
        case 'bpmn:BusinessRuleTask':
        case 'bpmn:ManualTask': return 'service-task';
        case 'bpmn:UserTask':
        case 'bpmn:Task': return 'task';
        case 'bpmn:SubProcess':
        case 'bpmn:CallActivity': return 'subprocess';
        default: return null;
    }
}

function applySaveStatus(status: 'saving' | 'saved' | 'error', message?: string): void {
    const el = document.getElementById('save-status');
    if (!el) { return; }
    el.classList.remove('status-saving', 'status-saved', 'status-error');
    el.classList.add('status-' + status);
    if (status === 'saving') { el.textContent = 'Salvando…'; el.title = 'Gravando alterações no .process'; }
    else if (status === 'saved') { el.textContent = '✓ Salvo'; el.title = 'Edições do preview salvam automaticamente no .process'; }
    else { el.textContent = '⚠ Erro'; el.title = message ? `Erro ao salvar: ${message}` : 'Erro ao salvar'; }
}

window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as HostMessage | null;
    if (!msg) { return; }
    if (msg.type === 'updateModel') { applyModelUpdate(msg); return; }
    if (msg.type === 'nodeCreated') {
        if (msg.tempId && msg.fluigId) { tempToFluig[msg.tempId] = msg.fluigId; flushPendingConnections(); }
        return;
    }
    if (msg.type === 'saveStatus') { applySaveStatus(msg.status, msg.message); return; }
    if (msg.type !== 'orgChartLoaded') { return; }
    GROUPS.length = 0; GROUPS.push(...(msg.groups || []));
    ROLES.length = 0; ROLES.push(...(msg.roles || []));
    const btn = document.getElementById('btn-load-orgchart') as HTMLButtonElement | null;
    if (btn) {
        btn.textContent = (GROUPS.length > 0 || ROLES.length > 0) ? '✓ Carregado' : (msg.error ? '⚠ Sem dados' : '✓ Vazio');
        btn.disabled = true;
    }
    if (selectedActivity && (selectedActivity.kind === 'task' || selectedActivity.kind === 'service-task')) {
        const mech = (document.getElementById('prop-mechanism-select') as HTMLSelectElement).value;
        const isGrp = mech === 'Grupo' || mech === 'Pool Grupo';
        const cur = (document.getElementById('prop-role-input') as HTMLInputElement).value ||
                    (document.getElementById('prop-role-select') as HTMLSelectElement).value || '';
        updateRoleControl(isGrp, cur);
    }
});

document.getElementById('btn-panel-close')!.addEventListener('click', hidePropertyPanel);
document.getElementById('btn-load-orgchart')!.addEventListener('click', () => {
    const btn = document.getElementById('btn-load-orgchart') as HTMLButtonElement;
    btn.textContent = '...'; btn.disabled = true;
    vscode.postMessage({ type: 'loadOrgChart' });
});
document.getElementById('btn-add-condition')!.addEventListener('click', () => {
    document.getElementById('conditions-list')!.appendChild(buildConditionRow('', ''));
});
document.getElementById('btn-open-script')!.addEventListener('click', () => {
    if (selectedActivity && selectedActivity.scriptFileName) {
        vscode.postMessage({ type: 'openScript', scriptFileName: selectedActivity.scriptFileName });
    }
});
document.getElementById('btn-open-subprocess')!.addEventListener('click', () => {
    if (selectedActivity && selectedActivity.process) {
        vscode.postMessage({ type: 'openSubProcess', processId: selectedActivity.process });
    }
});
document.getElementById('btn-open-form')!.addEventListener('click', () => {
    if (FORM_NAME) { vscode.postMessage({ type: 'openForm', formName: FORM_NAME }); }
});

document.getElementById('btn-save-props')!.addEventListener('click', () => {
    if (!selectedActivity) { return; }
    const a = selectedActivity;
    const id = a.id;
    const patch: { id: string; name?: string; scriptFileName?: string } = { id };
    const newName = (document.getElementById('prop-name') as HTMLInputElement).value.trim();
    if (newName !== (a.label || '')) { patch.name = newName; }
    if (a.kind === 'service-task') {
        const newScript = (document.getElementById('prop-script') as HTMLInputElement).value.trim();
        if (newScript !== (a.scriptFileName || '')) { patch.scriptFileName = newScript; }
    }
    if (Object.keys(patch).length > 1) {
        vscode.postMessage({ type: 'patchActivity', patch });
    }

    const isTask = a.kind === 'task' || a.kind === 'service-task';
    if (isTask) {
        const mechanism = (document.getElementById('prop-mechanism-select') as HTMLSelectElement).value;
        const roleSelect = document.getElementById('prop-role-select') as HTMLSelectElement;
        const roleInput = document.getElementById('prop-role-input') as HTMLInputElement;
        const roleVal = (!roleSelect.hidden ? roleSelect.value : roleInput.value).trim();
        const isGroup = mechanism === 'Grupo' || mechanism === 'Pool Grupo';
        const roleId = isGroup ? undefined : (roleVal || undefined);
        const groupId = isGroup ? (roleVal || undefined) : undefined;
        if (mechanism !== (a.managerMechanism || 'Papel') || roleVal !== (a.roleId || a.groupId || '')) {
            vscode.postMessage({ type: 'updateAssignment', id, mechanism, roleId, groupId });
        }
        const newSla = (document.getElementById('prop-sla') as HTMLInputElement).value.trim();
        if (newSla !== (a.expediente || '')) {
            vscode.postMessage({ type: 'updateSla', id, expediente: newSla });
        }
    }

    if (a.kind === 'gateway-exclusive') {
        const rows = document.getElementById('conditions-list')!.querySelectorAll('.condition-row');
        const conditions = Array.from(rows).map(row => ({
            expression: (row.querySelector('.cond-expr') as HTMLInputElement).value.trim(),
            targetTaskId: (row.querySelector('.cond-target') as HTMLInputElement).value.trim(),
        })).filter(c => c.expression && c.targetTaskId);
        vscode.postMessage({ type: 'updateConditions', id, conditions });
    }
});

['prop-name', 'prop-script'].forEach(id => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') (document.getElementById('btn-save-props') as HTMLButtonElement).click();
        });
    }
});
