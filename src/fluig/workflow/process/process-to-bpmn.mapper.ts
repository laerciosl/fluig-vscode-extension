/**
 * Converte um ProcessDefinition (Fluig/Graphiti) em BPMN 2.0 (OMG) para uso
 * como superfície de renderização/edição no bpmn-js.
 *
 * O BPMN gerado é uma VIEW — a fonte da verdade continua sendo o `.process`,
 * editado via ProcessGraph. Por isso a conversão é unidirecional: o host
 * mantém o mapa `bpmnId ↔ fluigId` (devolvido aqui) para traduzir os eventos
 * de edição do bpmn-js de volta em operações no ProcessGraph.
 */
import type {
    ProcessDefinition,
    ProcessActivity,
    ProcessTaskActivity,
    ProcessGatewayActivity,
    ProcessIntermediateEventActivity,
    ProcessSubProcessActivity,
    Coordinates,
    ActivityKind,
} from './process.types';
import type { EmfDiagram } from './process.emf-model';

interface Point { x: number; y: number; }

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

/** Cores semânticas por tipo de nó, espelhando o renderizador SVG. */
const NODE_COLORS: Partial<Record<ActivityKind, { fill: string; stroke: string }>> = {
    'start': { fill: '#c8f7c5', stroke: '#2e7d32' },
    'end': { fill: '#ffcdd2', stroke: '#c62828' },
    'end-cancel': { fill: '#ffe0b2', stroke: '#ef6c00' },
    'task': { fill: '#eef6ff', stroke: '#1565c0' },
    'service-task': { fill: '#eef6ff', stroke: '#1565c0' },
    'subprocess': { fill: '#eef6ff', stroke: '#1565c0' },
    'gateway-exclusive': { fill: '#fff9c4', stroke: '#f57f17' },
    'intermediate-link-throw': { fill: '#fff9c4', stroke: '#f9a825' },
    'intermediate-link-receive': { fill: '#fff9c4', stroke: '#f9a825' },
    'intermediate-error': { fill: '#ffccbc', stroke: '#d84315' },
};

export interface BpmnConversion {
    xml: string;
    /** bpmnElementId → fluigId (para traduzir seleção/eventos do bpmn-js). */
    idToFluig: Record<string, string>;
    /** fluigId → bpmnElementId. */
    fluigToId: Record<string, string>;
    /** Perdas de fidelidade conhecidas (diagnóstico/log). */
    losses: string[];
}

export function convertProcessToBpmn(def: ProcessDefinition, emf?: EmfDiagram): BpmnConversion {
    const losses: string[] = [];
    const { toBpmn, toFluig } = buildIdMap(def);
    const bid = (fluigId: string): string => toBpmn.get(fluigId) ?? sanitize(fluigId);
    const procId = sanitize(def.metadata.id || 'process');

    const gatewayById = new Map<string, ProcessGatewayActivity>();
    for (const a of def.activities) {
        if (a.kind === 'gateway-exclusive') { gatewayById.set(a.id, a as ProcessGatewayActivity); }
    }

    const flowNodes = def.activities.map(a => serializeActivity(a, bid, losses));

    const flows = def.transitions.map(t => {
        const gw = gatewayById.get(t.sourceRef);
        const cond = gw?.conditions.find(c => c.targetTaskId === t.targetRef)?.expression;
        const condXml = cond
            ? `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(cond)}</bpmn:conditionExpression>`
            : '';
        const attrs = `id="${bid(t.id)}" name="${esc(t.name)}" sourceRef="${bid(t.sourceRef)}" targetRef="${bid(t.targetRef)}"`;
        return condXml
            ? `    <bpmn:sequenceFlow ${attrs}>${condXml}</bpmn:sequenceFlow>`
            : `    <bpmn:sequenceFlow ${attrs}/>`;
    });

    const annotations = def.annotations.map(an =>
        `    <bpmn:textAnnotation id="${bid(an.id)}"><bpmn:text>${esc(an.name)}</bpmn:text></bpmn:textAnnotation>`
    );

    let laneSet = '';
    if (def.pool && def.pool.swimlanes.length > 0) {
        const laneAssign = assignActivitiesToLanes(def);
        const lanes = def.pool.swimlanes
            .map(l => {
                const refs = (laneAssign.get(l.id) ?? [])
                    .map(aid => `        <bpmn:flowNodeRef>${bid(aid)}</bpmn:flowNodeRef>`)
                    .join('\n');
                return refs
                    ? `      <bpmn:lane id="${bid(l.id)}" name="${esc(l.name)}">\n${refs}\n      </bpmn:lane>`
                    : `      <bpmn:lane id="${bid(l.id)}" name="${esc(l.name)}"/>`;
            })
            .join('\n');
        laneSet = `    <bpmn:laneSet>\n${lanes}\n    </bpmn:laneSet>`;
    }

    let collaboration = '';
    let planeElement = procId;
    if (def.pool) {
        collaboration =
            `  <bpmn:collaboration id="Collab_${procId}">\n` +
            `    <bpmn:participant id="${bid(def.pool.id)}" name="${esc(def.pool.name)}" processRef="${procId}"/>\n` +
            `  </bpmn:collaboration>`;
        planeElement = `Collab_${procId}`;
    }

    const process =
        `  <bpmn:process id="${procId}" name="${esc(def.metadata.name)}" isExecutable="false">\n` +
        [laneSet, ...flowNodes, ...flows, ...annotations].filter(Boolean).join('\n') +
        `\n  </bpmn:process>`;

    const di = serializeDi(def, planeElement, bid, emf);

    if (def.metadata.cardIndex) {
        losses.push(`cardIndex "${def.metadata.cardIndex}" (formulário) sem equivalente BPMN`);
    }

    const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<bpmn:definitions xmlns:bpmn="${BPMN_NS}" ` +
        `xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ` +
        `xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ` +
        `xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" ` +
        `xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" ` +
        `xmlns:fluig="http://fluig.totvs.com/bpmn" ` +
        `targetNamespace="http://fluig.totvs.com" id="Defs_${procId}">\n` +
        (collaboration ? collaboration + '\n' : '') +
        process + '\n' +
        di + '\n' +
        `</bpmn:definitions>\n`;

    return {
        xml,
        idToFluig: Object.fromEntries(toFluig),
        fluigToId: Object.fromEntries(toBpmn),
        losses,
    };
}

// ── ids ─────────────────────────────────────────────────────────────────────

function sanitize(id: string): string {
    return 'n_' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildIdMap(def: ProcessDefinition): { toBpmn: Map<string, string>; toFluig: Map<string, string> } {
    const toBpmn = new Map<string, string>();
    const toFluig = new Map<string, string>();
    const used = new Set<string>();

    const alloc = (fluigId: string): void => {
        if (toBpmn.has(fluigId)) { return; }
        const base = sanitize(fluigId);
        let candidate = base;
        let i = 1;
        while (used.has(candidate)) { candidate = `${base}_${i++}`; }
        used.add(candidate);
        toBpmn.set(fluigId, candidate);
        toFluig.set(candidate, fluigId);
    };

    if (def.pool) {
        alloc(def.pool.id);
        for (const l of def.pool.swimlanes) { alloc(l.id); }
    }
    for (const a of def.activities) { alloc(a.id); }
    for (const t of def.transitions) { alloc(t.id); }
    for (const an of def.annotations) { alloc(an.id); }

    return { toBpmn, toFluig };
}

// ── flow nodes ────────────────────────────────────────────────────────────

function serializeActivity(a: ProcessActivity, bid: (id: string) => string, losses: string[]): string {
    let tag: string;
    let extra = '';
    let attrs = '';

    switch (a.kind) {
        case 'start': tag = 'startEvent'; break;
        case 'end': tag = 'endEvent'; break;
        case 'end-cancel':
            tag = 'endEvent';
            extra = '<bpmn:terminateEventDefinition/>';
            losses.push('end-cancel → endEvent+terminate (cancel só vale em transaction subprocess)');
            break;
        case 'task': tag = 'userTask'; break;
        case 'service-task': tag = 'serviceTask'; break;
        case 'subprocess': {
            tag = 'callActivity';
            const proc = (a as ProcessSubProcessActivity).process;
            if (proc) { attrs += ` calledElement="${bid(proc)}"`; }
            break;
        }
        case 'gateway-exclusive': tag = 'exclusiveGateway'; break;
        case 'intermediate-link-throw':
            tag = 'intermediateThrowEvent';
            extra = `<bpmn:linkEventDefinition name="${esc((a as ProcessIntermediateEventActivity).linkId ?? a.name)}"/>`;
            break;
        case 'intermediate-link-receive':
            tag = 'intermediateCatchEvent';
            extra = `<bpmn:linkEventDefinition name="${esc(a.name)}"/>`;
            break;
        case 'intermediate-error': {
            tag = 'boundaryEvent';
            extra = '<bpmn:errorEventDefinition/>';
            const parent = (a as ProcessIntermediateEventActivity).parentTask;
            if (parent) { attrs += ` attachedToRef="${bid(parent)}"`; }
            break;
        }
        default: tag = 'task';
    }

    const ext = fluigExtensions(a);
    const inner = ext + extra;
    const head = `<bpmn:${tag} id="${bid(a.id)}" name="${esc(a.name)}"${attrs}`;
    return inner
        ? `    ${head}>${inner}</bpmn:${tag}>`
        : `    ${head}/>`;
}

/** Empacota dados específicos do Fluig em extensionElements (view self-descriptive). */
function fluigExtensions(a: ProcessActivity): string {
    const props: string[] = [];
    if (a.kind === 'task' || a.kind === 'service-task') {
        const t = a as ProcessTaskActivity;
        if (t.managerMechanism) { props.push(`mechanism="${esc(t.managerMechanism)}"`); }
        if (t.assignment?.roleId) { props.push(`roleId="${esc(t.assignment.roleId)}"`); }
        if (t.assignment?.groupId) { props.push(`groupId="${esc(t.assignment.groupId)}"`); }
        if (t.scriptFileName) { props.push(`scriptFileName="${esc(t.scriptFileName)}"`); }
        if (t.extraAttributes?.expediente) { props.push(`expediente="${esc(t.extraAttributes.expediente)}"`); }
    }
    if (a.kind === 'subprocess') {
        const sub = a as ProcessSubProcessActivity;
        if (sub.process) { props.push(`process="${esc(sub.process)}"`); }
    }
    return props.length ? `<bpmn:extensionElements><fluig:meta ${props.join(' ')}/></bpmn:extensionElements>` : '';
}

// ── DI (diagrama) ───────────────────────────────────────────────────────────

function serializeDi(
    def: ProcessDefinition,
    planeElement: string,
    bid: (id: string) => string,
    emf?: EmfDiagram
): string {
    const bendpointsByFlow = buildBendpointMap(emf);
    const shapes: string[] = [];
    const pushShape = (
        fluigId: string,
        c: Coordinates | undefined,
        opts: { isPool?: boolean; color?: { fill: string; stroke: string } } = {}
    ): void => {
        if (!c) { return; }
        const id = bid(fluigId);
        const colorAttrs = opts.color
            ? ` bioc:stroke="${opts.color.stroke}" bioc:fill="${opts.color.fill}"` +
              ` color:border-color="${opts.color.stroke}" color:background-color="${opts.color.fill}"`
            : '';
        shapes.push(
            `      <bpmndi:BPMNShape id="di_${id}" bpmnElement="${id}"${opts.isPool ? ' isHorizontal="true"' : ''}${colorAttrs}>\n` +
            `        <dc:Bounds x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}"/>\n` +
            `      </bpmndi:BPMNShape>`
        );
    };

    // Lanes têm coords relativas ao pool (Graphiti); DI BPMN é absoluto → soma o offset do pool.
    const poolOx = def.pool?.coords?.x ?? 0;
    const poolOy = def.pool?.coords?.y ?? 0;
    if (def.pool) { pushShape(def.pool.id, def.pool.coords, { isPool: true }); }
    for (const l of def.pool?.swimlanes ?? []) {
        if (l.coords) {
            pushShape(
                l.id,
                { x: poolOx + l.coords.x, y: poolOy + l.coords.y, width: l.coords.width, height: l.coords.height },
                { isPool: true }
            );
        }
    }
    for (const a of def.activities) { pushShape(a.id, a.coords, { color: NODE_COLORS[a.kind] }); }
    for (const an of def.annotations) { pushShape(an.id, an.coords); }

    const coordsById = new Map<string, Coordinates>();
    for (const a of def.activities) { if (a.coords) { coordsById.set(a.id, a.coords); } }

    const edges: string[] = [];
    for (const t of def.transitions) {
        const s = coordsById.get(t.sourceRef);
        const tg = coordsById.get(t.targetRef);
        if (!s || !tg) { continue; }
        const id = bid(t.id);
        const bends = bendpointsByFlow.get(t.id) ?? [];
        // Extremidades projetadas na borda do nó (em direção ao próximo ponto),
        // intercalando os bendpoints reais do pictograma no meio.
        const sCenter = centerOf(s);
        const tCenter = centerOf(tg);
        const firstAway = bends[0] ?? tCenter;
        const lastAway = bends[bends.length - 1] ?? sCenter;
        const start = projectToBorder(s, firstAway);
        const end = projectToBorder(tg, lastAway);
        const points = [start, ...bends, end];
        const wp = points
            .map(p => `        <di:waypoint x="${Math.round(p.x)}" y="${Math.round(p.y)}"/>`)
            .join('\n');
        edges.push(
            `      <bpmndi:BPMNEdge id="di_${id}" bpmnElement="${id}">\n` +
            wp + '\n' +
            `      </bpmndi:BPMNEdge>`
        );
    }

    return (
        `  <bpmndi:BPMNDiagram id="diagram">\n` +
        `    <bpmndi:BPMNPlane id="plane" bpmnElement="${planeElement}">\n` +
        [...shapes, ...edges].join('\n') + '\n' +
        `    </bpmndi:BPMNPlane>\n` +
        `  </bpmndi:BPMNDiagram>`
    );
}

// ── waypoints / bendpoints ──────────────────────────────────────────────────

/** Extrai os `<bendpoints x= y=>` de cada connection do pictograma, por flow id. */
function buildBendpointMap(emf?: EmfDiagram): Map<string, Point[]> {
    const map = new Map<string, Point[]>();
    if (!emf) { return map; }
    for (const conn of emf.connections) {
        const points: Point[] = [];
        const re = /<bendpoints\b([^>]*)\/>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(conn.rawXml)) !== null) {
            const x = Number(/\bx="(-?\d+(?:\.\d+)?)"/.exec(m[1])?.[1] ?? NaN);
            const y = Number(/\by="(-?\d+(?:\.\d+)?)"/.exec(m[1])?.[1] ?? NaN);
            if (Number.isFinite(x) && Number.isFinite(y)) { points.push({ x, y }); }
        }
        if (points.length) { map.set(conn.businessId, points); }
    }
    return map;
}

function centerOf(c: Coordinates): Point {
    return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
}

/**
 * Atribui cada atividade à lane que contém seu centro (geometria), já que o BPMN
 * exige flowNodeRefs explícitos enquanto o Fluig usa posição. Lanes têm coords
 * relativas ao pool → converte para absoluto antes de testar a contenção.
 */
function assignActivitiesToLanes(def: ProcessDefinition): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const pool = def.pool;
    if (!pool || pool.swimlanes.length === 0) { return result; }
    const ox = pool.coords?.x ?? 0;
    const oy = pool.coords?.y ?? 0;
    const lanes = pool.swimlanes
        .filter(l => l.coords)
        .map(l => ({ id: l.id, x: ox + l.coords!.x, y: oy + l.coords!.y, w: l.coords!.width, h: l.coords!.height }));
    for (const l of lanes) { result.set(l.id, []); }
    for (const a of def.activities) {
        if (!a.coords) { continue; }
        const cx = a.coords.x + a.coords.width / 2;
        const cy = a.coords.y + a.coords.height / 2;
        const lane =
            lanes.find(l => cx >= l.x && cx <= l.x + l.w && cy >= l.y && cy <= l.y + l.h) ??
            lanes.find(l => cy >= l.y && cy <= l.y + l.h); // fallback: só faixa vertical
        if (lane) { result.get(lane.id)!.push(a.id); }
    }
    return result;
}

/** Projeta o centro de `node` na sua borda, em direção a `toward`. */
function projectToBorder(node: Coordinates, toward: Point): Point {
    const from = centerOf(node);
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    if (dx === 0 && dy === 0) { return from; }
    const scaleX = dx === 0 ? Infinity : (node.width / 2) / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : (node.height / 2) / Math.abs(dy);
    const scale = Math.min(scaleX, scaleY);
    return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function esc(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
