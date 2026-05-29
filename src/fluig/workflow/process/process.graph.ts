import type { ActivityKind, ProcessActivity, ProcessDefinition, ProcessTaskActivity, ProcessGatewayActivity } from './process.types';
import type { EmfDiagram, EmfShape, EmfConnection } from './process.emf-model';
import { serializeProcess } from './process.serializer';
import {
    buildShapeXml,
    buildConnectionXml,
    extractStyleRefs,
    DEFAULT_NODE_SIZE,
} from './process.shape-template';

export interface AddNodeOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    /** Apenas service-task. */
    scriptFileName?: string;
    managerMechanism?: string;
    extraAttributes?: Record<string, string>;
}

/**
 * Motor de grafo mutável para edição estrutural de processos Fluig.
 *
 * Mantém ProcessDefinition (business layer) e EmfDiagram (pictogram layer)
 * sincronizados. O serializeProcess() do Sprint 1 recalcula todos os refs
 * EMF automaticamente ao escrever o arquivo.
 *
 * Exemplo de uso:
 *   const graph = ProcessGraph.from(parseProcess(xml), extractEmfDiagram(xml));
 *   const id = graph.addNode('task', 'Nova Tarefa', { x: 200, y: 100 });
 *   graph.connect('start1', id);
 *   const newXml = graph.serialize();
 */
export class ProcessGraph {
    private _def: ProcessDefinition;
    private _emf: EmfDiagram;

    private constructor(def: ProcessDefinition, emf: EmfDiagram) {
        // Trabalha em cópias rasas dos arrays para não mutar o input
        this._def = {
            ...def,
            activities: [...def.activities],
            transitions: [...def.transitions],
            annotations: [...def.annotations],
            pool: def.pool ? { ...def.pool, swimlanes: [...def.pool.swimlanes] } : undefined,
        };
        this._emf = {
            ...emf,
            shapes: [...emf.shapes],
            connections: [...emf.connections],
        };
    }

    static from(def: ProcessDefinition, emf: EmfDiagram): ProcessGraph {
        return new ProcessGraph(def, emf);
    }

    get def(): ProcessDefinition { return this._def; }
    get emf(): EmfDiagram { return this._emf; }

    // ── Operações de nó ───────────────────────────────────────────────────

    /**
     * Adiciona uma nova atividade ao processo. Retorna o id gerado.
     *
     * Se x/y não forem informados, posiciona automaticamente após o último
     * nó existente (offset de 150px).
     */
    addNode(kind: ActivityKind, name: string, opts: AddNodeOptions = {}): string {
        const id = this.generateNodeId(kind);
        const childIndex = this.nextChildIndex();

        const size = DEFAULT_NODE_SIZE[kind];
        const autoPos = this.computeAutoPosition(kind);
        const x = opts.x ?? autoPos.x;
        const y = opts.y ?? autoPos.y;
        const w = opts.width ?? size.w;
        const h = opts.height ?? size.h;

        // Extrair style hints do primeiro nó do mesmo tipo no processo
        const styleRefs = extractStyleRefs(
            this._emf.shapes,
            s => this._def.activities.find(a => a.id === s.businessId)?.kind === kind
        );

        const rawXml = buildShapeXml({ businessId: id, kind, label: name, x, y, width: w, height: h, childIndex, styleRefs });

        // --- Atualizar business layer ---
        const activity = this.buildActivity(id, kind, name, opts);
        this._def.activities.push(activity);

        // --- Atualizar pictogram layer ---
        this._emf.shapes.push({
            businessId: id,
            childIndex,
            rawXml,
            outgoingFlowIds: [],
            incomingFlowIds: [],
        });

        return id;
    }

    /** Remove uma atividade e todas as suas transições. */
    removeNode(id: string): void {
        // Remover transitions conectadas primeiro
        const connected = this._def.transitions
            .filter(t => t.sourceRef === id || t.targetRef === id)
            .map(t => t.id);
        for (const flowId of connected) {
            this.disconnect(flowId);
        }

        this._def.activities = this._def.activities.filter(a => a.id !== id);
        this._emf.shapes = this._emf.shapes.filter(s => s.businessId !== id);
    }

    /**
     * Atualiza as coordenadas x/y de uma atividade.
     * Faz patch no rawXml do shape (substitui x="..." e y="..." no graphicsAlgorithm externo).
     */
    moveNode(id: string, x: number, y: number): void {
        const shape = this._emf.shapes.find(s => s.businessId === id);
        if (!shape) { return; }

        // Substituir x e y APENAS na primeira ocorrência (graphicsAlgorithm externo)
        let patched = shape.rawXml;
        patched = patchFirstGraphicsAlgorithmCoord(patched, 'x', x);
        patched = patchFirstGraphicsAlgorithmCoord(patched, 'y', y);
        shape.rawXml = patched;

        const activity = this._def.activities.find(a => a.id === id);
        if (activity?.coords) {
            activity.coords = { ...activity.coords, x, y };
        }
    }

    /**
     * Renomeia uma atividade.
     * Atualiza name na activity e o value="..." do al:MultiText no rawXml.
     */
    renameNode(id: string, name: string): void {
        const activity = this._def.activities.find(a => a.id === id);
        if (activity) {
            (activity as { name: string }).name = name;
        }

        const shape = this._emf.shapes.find(s => s.businessId === id);
        if (shape) {
            // Substituir value="..." no al:MultiText
            shape.rawXml = shape.rawXml.replace(
                /(<graphicsAlgorithm[^>]*xsi:type="al:MultiText"[^>]*)value="[^"]*"/,
                `$1value="${escapeForXml(name)}"`
            );
        }
    }

    // ── Operações de aresta ───────────────────────────────────────────────

    /**
     * Cria uma transição entre dois nós. Retorna o id do flow gerado.
     */
    connect(sourceId: string, targetId: string, label = ''): string {
        const flowId = this.generateFlowId();
        const connectionIndex = this.nextConnectionIndex();
        const rawXml = buildConnectionXml(flowId, label);

        // --- Business layer ---
        this._def.transitions.push({
            id: flowId,
            name: label,
            sourceRef: sourceId,
            targetRef: targetId,
        });

        // --- Pictogram layer ---
        const conn: EmfConnection = {
            businessId: flowId,
            connectionIndex,
            rawXml,
            sourceBusinessId: sourceId,
            targetBusinessId: targetId,
        };
        this._emf.connections.push(conn);

        // Atualizar outgoing/incoming nos shapes
        const srcShape = this._emf.shapes.find(s => s.businessId === sourceId);
        if (srcShape) { srcShape.outgoingFlowIds.push(flowId); }

        const tgtShape = this._emf.shapes.find(s => s.businessId === targetId);
        if (tgtShape) { tgtShape.incomingFlowIds.push(flowId); }

        // Atualizar incoming/outgoing nas activities
        const srcAct = this._def.activities.find(a => a.id === sourceId);
        if (srcAct && !srcAct.outgoing.includes(flowId)) {
            srcAct.outgoing.push(flowId);
        }
        const tgtAct = this._def.activities.find(a => a.id === targetId);
        if (tgtAct && !tgtAct.incoming.includes(flowId)) {
            tgtAct.incoming.push(flowId);
        }

        return flowId;
    }

    /** Remove uma transição. */
    disconnect(flowId: string): void {
        const transition = this._def.transitions.find(t => t.id === flowId);

        this._def.transitions = this._def.transitions.filter(t => t.id !== flowId);
        this._emf.connections = this._emf.connections.filter(c => c.businessId !== flowId);

        if (transition) {
            const srcShape = this._emf.shapes.find(s => s.businessId === transition.sourceRef);
            if (srcShape) {
                srcShape.outgoingFlowIds = srcShape.outgoingFlowIds.filter(id => id !== flowId);
            }
            const tgtShape = this._emf.shapes.find(s => s.businessId === transition.targetRef);
            if (tgtShape) {
                tgtShape.incomingFlowIds = tgtShape.incomingFlowIds.filter(id => id !== flowId);
            }
            const srcAct = this._def.activities.find(a => a.id === transition.sourceRef);
            if (srcAct) {
                srcAct.outgoing = srcAct.outgoing.filter(id => id !== flowId);
            }
            const tgtAct = this._def.activities.find(a => a.id === transition.targetRef);
            if (tgtAct) {
                tgtAct.incoming = tgtAct.incoming.filter(id => id !== flowId);
            }
        }
    }

    // ── Serialização ──────────────────────────────────────────────────────

    // ── Propriedades semânticas ───────────────────────────────────────────

    /**
     * Atualiza o mecanismo de atribuição de uma task/service-task.
     * Gera o rawAssignmentXml no formato XStream esperado pelo Fluig.
     */
    updateAssignment(id: string, mechanism: string, roleId?: string, groupId?: string): void {
        const activity = this._def.activities.find(a => a.id === id);
        if (!activity || (activity.kind !== 'task' && activity.kind !== 'service-task')) {
            return;
        }
        const t = activity as ProcessTaskActivity;
        t.managerMechanism = mechanism;
        t.rawAssignmentXml = serializeAssignmentXml(mechanism, roleId, groupId);
        t.assignment = { mechanism, roleId, groupId };
    }

    /**
     * Atualiza as condições de saída de um gateway exclusivo.
     * Gera o rawConditionXml no formato XStream esperado pelo Fluig.
     */
    updateGatewayConditions(id: string, conditions: GatewayConditionInput[]): void {
        const activity = this._def.activities.find(a => a.id === id);
        if (!activity || activity.kind !== 'gateway-exclusive') { return; }
        const g = activity as ProcessGatewayActivity;
        g.conditions = conditions.map((c, i) => ({
            order: i + 1,
            expression: c.expression,
            targetTaskId: c.targetTaskId,
        }));
        g.rawConditionXml = serializeConditionsXml(conditions);
    }

    /**
     * Atualiza o texto (campo `name`) de uma BpmnAnnotation.
     * Patcha o atributo na business layer e o `value="..."` do al:MultiText no
     * rawXml do EMF — mesmo padrão de renameNode para atividades.
     */
    updateAnnotation(id: string, text: string): void {
        const annotation = this._def.annotations.find(a => a.id === id);
        if (annotation) {
            (annotation as { name: string }).name = text;
        }
        const shape = this._emf.shapes.find(s => s.businessId === id);
        if (shape) {
            shape.rawXml = shape.rawXml.replace(
                /(<graphicsAlgorithm[^>]*xsi:type="al:MultiText"[^>]*)value="[^"]*"/,
                `$1value="${escapeForXml(text)}"`
            );
        }
    }

    /**
     * Atualiza o SLA (expediente) de uma atividade.
     * O valor é armazenado em extraAttributes.expediente.
     */
    updateSla(id: string, expediente: string): void {
        const activity = this._def.activities.find(a => a.id === id);
        if (!activity) { return; }
        if (!activity.extraAttributes) {
            activity.extraAttributes = {};
        }
        activity.extraAttributes.expediente = expediente;
    }

    /** Serializa o processo atual para XML .process válido. */
    serialize(): string {
        return serializeProcess(this._def, this._emf);
    }

    // ── Helpers privados ──────────────────────────────────────────────────

    private nextChildIndex(): number {
        if (this._emf.shapes.length === 0) { return 1; }
        return Math.max(...this._emf.shapes.map(s => s.childIndex)) + 1;
    }

    private nextConnectionIndex(): number {
        if (this._emf.connections.length === 0) { return 0; }
        return Math.max(...this._emf.connections.map(c => c.connectionIndex)) + 1;
    }

    private generateNodeId(kind: ActivityKind): string {
        const prefix = KIND_ID_PREFIX[kind];
        const existing = this._def.activities
            .map(a => a.id)
            .filter(id => id.startsWith(prefix))
            .map(id => parseInt(id.slice(prefix.length), 10))
            .filter(n => !isNaN(n));
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        return `${prefix}${next}`;
    }

    private generateFlowId(): string {
        const existing = this._def.transitions
            .map(t => t.id)
            .filter(id => id.startsWith('flow'))
            .map(id => parseInt(id.slice(4), 10))
            .filter(n => !isNaN(n));
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        return `flow${next}`;
    }

    private computeAutoPosition(kind: ActivityKind): { x: number; y: number } {
        const size = DEFAULT_NODE_SIZE[kind];
        if (this._emf.shapes.length === 0) {
            return { x: 100, y: 100 };
        }
        // Posicionar 150px à direita do último shape existente
        const last = this._emf.shapes.reduce((a, b) => a.childIndex > b.childIndex ? a : b);
        // Extrair x do rawXml do último shape
        const xMatch = /graphicsAlgorithm[^>]+x="(\d+)"/.exec(last.rawXml);
        const yMatch = /graphicsAlgorithm[^>]+y="(\d+)"/.exec(last.rawXml);
        const lastX = xMatch ? parseInt(xMatch[1], 10) : 100;
        const lastY = yMatch ? parseInt(yMatch[1], 10) : 100;
        return { x: lastX + 150, y: lastY + Math.round((size.h - DEFAULT_NODE_SIZE[kind].h) / 2) };
    }

    private buildActivity(id: string, kind: ActivityKind, name: string, opts: AddNodeOptions): ProcessActivity {
        const base = {
            id,
            name,
            kind,
            typeCode: KIND_TYPE_CODE[kind],
            incoming: [] as string[],
            outgoing: [] as string[],
            extraAttributes: opts.extraAttributes,
        };

        if (kind === 'task' || kind === 'service-task') {
            const task: ProcessTaskActivity = {
                ...base,
                kind,
                managerMechanism: opts.managerMechanism,
                scriptFileName: kind === 'service-task' ? opts.scriptFileName : undefined,
            };
            return task;
        }

        if (kind === 'gateway-exclusive') {
            return { ...base, kind, conditions: [] };
        }

        if (kind === 'intermediate-link-throw') {
            return { ...base, kind };
        }
        if (kind === 'intermediate-link-receive') {
            return { ...base, kind };
        }
        if (kind === 'intermediate-error') {
            return { ...base, kind };
        }

        if (kind === 'subprocess') {
            return { ...base, kind };
        }

        // start / end / end-cancel
        return { ...base, kind } as ProcessActivity;
    }
}

// ── Constantes ────────────────────────────────────────────────────────────

const KIND_ID_PREFIX: Record<ActivityKind, string> = {
    'start':                    'startevent',
    'end':                      'endevent',
    'end-cancel':               'endeventcancel',
    'task':                     'task',
    'service-task':             'task',
    'subprocess':               'subprocess',
    'gateway-exclusive':        'exclusivegateway',
    'intermediate-link-throw':  'intermediatelink',
    'intermediate-link-receive':'intermediatelink',
    'intermediate-error':       'intermediateerror',
};

const KIND_TYPE_CODE: Record<ActivityKind, number> = {
    'start':                    10,
    'end':                      0,
    'end-cancel':               65,
    'task':                     80,
    'service-task':             82,
    'subprocess':               0,
    'gateway-exclusive':        120,
    'intermediate-link-throw':  36,
    'intermediate-link-receive':42,
    'intermediate-error':       43,
};

// ── Helpers de XML ────────────────────────────────────────────────────────

/** Faz patch de um atributo de coordenada (x ou y) APENAS na primeira ocorrência de graphicsAlgorithm. */
function patchFirstGraphicsAlgorithmCoord(xml: string, coord: 'x' | 'y', value: number): string {
    // Encontrar a primeira tag <graphicsAlgorithm
    const gaStart = xml.indexOf('<graphicsAlgorithm');
    if (gaStart < 0) { return xml; }
    const gaEnd = xml.indexOf('>', gaStart);
    if (gaEnd < 0) { return xml; }

    let tag = xml.substring(gaStart, gaEnd + 1);
    const pattern = new RegExp(`\\b${coord}="[^"]*"`);

    if (pattern.test(tag)) {
        tag = tag.replace(pattern, `${coord}="${value}"`);
    } else {
        // Inserir antes do > ou />
        tag = tag.replace(/(\s*\/?>)$/, ` ${coord}="${value}"$1`);
    }

    return xml.substring(0, gaStart) + tag + xml.substring(gaEnd + 1);
}

function escapeForXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '&#xA;');
}

// ── XStream serializers ───────────────────────────────────────────────────

export interface GatewayConditionInput {
    expression: string;
    targetTaskId: string;
}

const MECHANISM_CLASS: Record<string, string> = {
    'Papel':       'org.eclipse.bpmn2.impl.AssignmentControllerRole',
    'Pool Papel':  'org.eclipse.bpmn2.impl.AssignmentControllerPoolRole',
    'Grupo':       'org.eclipse.bpmn2.impl.AssignmentControllerGroup',
    'Pool Grupo':  'org.eclipse.bpmn2.impl.AssignmentControllerPoolGroup',
};

/**
 * Serializa os dados de atribuição para o formato XStream usado pelo Fluig.
 *
 * O resultado deve ser armazenado em ProcessTaskActivity.rawAssignmentXml e
 * será re-encodificado como atributo XML pelo serializador.
 */
export function serializeAssignmentXml(mechanism: string, roleId?: string, groupId?: string): string {
    const className = MECHANISM_CLASS[mechanism]
        ?? 'org.eclipse.bpmn2.impl.AssignmentControllerRole';
    const inner: string[] = [];
    if (roleId)  { inner.push(`  <roleId>${escXmlContent(roleId)}</roleId>`); }
    if (groupId) { inner.push(`  <groupId>${escXmlContent(groupId)}</groupId>`); }
    inner.push(`  <mechanismName>${escXmlContent(mechanism)}</mechanismName>`);
    return `<${className}>\n${inner.join('\n')}\n</${className}>`;
}

/**
 * Serializa condições de gateway para o formato XStream usado pelo Fluig.
 *
 * Expressões com aspas duplas devem usar &quot; para serem válidas dentro
 * do XML de condição (que por sua vez será encodificado como atributo XML).
 */
export function serializeConditionsXml(conditions: GatewayConditionInput[]): string {
    if (conditions.length === 0) { return '<list/>'; }
    const items = conditions.map((c, i) => [
        '  <org.eclipse.bpmn2.impl.ConditionImpl>',
        `    <order>${i + 1}</order>`,
        `    <expression>${escXmlConditionExpr(c.expression)}</expression>`,
        `    <targetTask>${escXmlContent(c.targetTaskId)}</targetTask>`,
        '    <conditionType>0</conditionType>',
        '  </org.eclipse.bpmn2.impl.ConditionImpl>',
    ].join('\n'));
    return `<list>\n${items.join('\n')}\n</list>`;
}

/** Escapamento para conteúdo de elemento XML (não atributo). */
function escXmlContent(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapamento para expressões dentro de condição XML (aninhada em atributo).
 * Aspas duplas → &quot; pois o XML de condição será posteriormente encodificado
 * como valor de atributo pelo serializer (&quot; → &amp;quot;).
 */
function escXmlConditionExpr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
