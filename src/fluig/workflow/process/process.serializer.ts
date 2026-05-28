import type { EmfDiagram, EmfShape, EmfConnection } from './process.emf-model';
import type {
    ProcessDefinition,
    ProcessActivity,
    ProcessTaskActivity,
    ProcessGatewayActivity,
    ProcessIntermediateEventActivity,
    ProcessSubProcessActivity,
    ProcessTransition,
    ProcessPool,
    ProcessSwimlane,
    ProcessMetadata,
    ProcessAnnotation,
} from './process.types';

/**
 * Serializa um ProcessDefinition + EmfDiagram de volta a um arquivo `.process` válido.
 *
 * O round-trip preserva:
 * - Business layer: todos os atributos via extraAttributes
 * - Pictogram layer: rawXml dos shapes/connections + refs remendadas
 *
 * Uso:
 *   const def  = parseProcess(xml);
 *   const emf  = extractEmfDiagram(xml);
 *   const xml2 = serializeProcess(def, emf);
 *   // parseProcess(xml2) deepEquals def (semântico)
 */
export function serializeProcess(def: ProcessDefinition, emf: EmfDiagram): string {
    // 1. Índice businessId → childIndex para regenerar refs de connections
    const shapeIndex = buildShapeIndex(emf.shapes);

    // 2. Remendar anchors dos shapes (outgoing/incomingConnections)
    const patchedShapes = patchShapeAnchors(emf.shapes, emf.connections);

    // 3. Remendar start/end das connections
    const patchedConnections = patchConnectionRefs(emf.connections, shapeIndex);

    // 4. Regenerar pictogramLinks
    const pictogramLinks = buildPictogramLinks(emf.pool, patchedShapes, patchedConnections);

    // 5. Serializar business layer
    const businessXml = serializeBusinessLayer(def);

    // 6. Montar XML final
    return assembleXml(emf, pictogramLinks, patchedShapes, patchedConnections, businessXml);
}

// ── Índice ────────────────────────────────────────────────────────────────

function buildShapeIndex(shapes: EmfShape[]): Map<string, number> {
    const index = new Map<string, number>();
    for (const s of shapes) {
        index.set(s.businessId, s.childIndex);
    }
    return index;
}

// ── Patch dos anchors nos shapes ──────────────────────────────────────────

/**
 * Atualiza `outgoingConnections` e `incomingConnections` no primeiro
 * `<anchors xsi:type="pi:ChopboxAnchor">` de cada shape raw XML.
 */
function patchShapeAnchors(shapes: EmfShape[], connections: EmfConnection[]): EmfShape[] {
    // Mapear businessId → lista de connectionIndex dos flows que partem/chegam
    const outMap = new Map<string, number[]>();
    const inMap = new Map<string, number[]>();

    for (const conn of connections) {
        if (conn.sourceBusinessId) {
            const list = outMap.get(conn.sourceBusinessId) ?? [];
            list.push(conn.connectionIndex);
            outMap.set(conn.sourceBusinessId, list);
        }
        if (conn.targetBusinessId) {
            const list = inMap.get(conn.targetBusinessId) ?? [];
            list.push(conn.connectionIndex);
            inMap.set(conn.targetBusinessId, list);
        }
    }

    return shapes.map(shape => {
        const outgoing = (outMap.get(shape.businessId) ?? [])
            .map(i => `/0/@connections.${i}`).join(' ');
        const incoming = (inMap.get(shape.businessId) ?? [])
            .map(i => `/0/@connections.${i}`).join(' ');

        const patchedXml = patchChopboxAnchor(shape.rawXml, outgoing, incoming);
        return { ...shape, rawXml: patchedXml };
    });
}

/** Substitui outgoingConnections/incomingConnections no primeiro ChopboxAnchor do XML. */
function patchChopboxAnchor(xml: string, outgoing: string, incoming: string): string {
    // Encontrar o primeiro <anchors xsi:type="pi:ChopboxAnchor"
    const anchorStart = xml.indexOf('<anchors xsi:type="pi:ChopboxAnchor"');
    if (anchorStart < 0) { return xml; }

    const anchorEnd = xml.indexOf('>', anchorStart);
    if (anchorEnd < 0) { return xml; }

    let anchorTag = xml.substring(anchorStart, anchorEnd + 1);

    // Remover atributos antigos
    anchorTag = anchorTag.replace(/\s+outgoingConnections="[^"]*"/, '');
    anchorTag = anchorTag.replace(/\s+incomingConnections="[^"]*"/, '');

    // Inserir novos (apenas se não vazios), antes do />  ou >
    let additions = '';
    if (outgoing) { additions += ` outgoingConnections="${outgoing}"`; }
    if (incoming) { additions += ` incomingConnections="${incoming}"`; }

    if (additions) {
        anchorTag = anchorTag.replace(/(\s*\/?>)$/, `${additions}$1`);
    }

    return xml.substring(0, anchorStart) + anchorTag + xml.substring(anchorEnd + 1);
}

// ── Patch das connections (start/end) ────────────────────────────────────

function patchConnectionRefs(
    connections: EmfConnection[],
    shapeIndex: Map<string, number>
): EmfConnection[] {
    return connections.map(conn => {
        const srcIdx = shapeIndex.get(conn.sourceBusinessId);
        const tgtIdx = shapeIndex.get(conn.targetBusinessId);

        if (srcIdx === undefined || tgtIdx === undefined) {
            return conn;
        }

        const newStart = `/0/@children.${srcIdx}/@anchors.0`;
        const newEnd   = `/0/@children.${tgtIdx}/@anchors.0`;

        let xml = conn.rawXml;
        xml = xml.replace(/\bstart="[^"]*"/, `start="${newStart}"`);
        xml = xml.replace(/\bend="[^"]*"/, `end="${newEnd}"`);

        return { ...conn, rawXml: xml };
    });
}

// ── pictogramLinks ────────────────────────────────────────────────────────

function buildPictogramLinks(
    pool: { businessId: string; swimlaneCount: number },
    shapes: EmfShape[],
    connections: EmfConnection[]
): string {
    const refs: string[] = [];

    // Pool
    refs.push('/0/@children.0/@link');

    // Swimlanes do pool (em ordem decrescente, como no arquivo original)
    for (let i = pool.swimlaneCount - 1; i >= 0; i--) {
        refs.push(`/0/@children.0/@children.${i}/@link`);
    }

    // Shapes (atividades) — em ordem de childIndex
    const sorted = [...shapes].sort((a, b) => a.childIndex - b.childIndex);
    for (const shape of sorted) {
        refs.push(`/0/@children.${shape.childIndex}/@link`);
    }

    // Connections — em ordem de connectionIndex
    const sortedConns = [...connections].sort((a, b) => a.connectionIndex - b.connectionIndex);
    for (const conn of sortedConns) {
        refs.push(`/0/@connections.${conn.connectionIndex}/@link`);
    }

    return refs.join(' ');
}

// ── Business layer ────────────────────────────────────────────────────────

function serializeBusinessLayer(def: ProcessDefinition): string {
    const lines: string[] = [];

    lines.push(serializeBpmnProcess(def.metadata));

    if (def.pool) {
        lines.push(serializePool(def.pool));
        for (const lane of def.pool.swimlanes) {
            lines.push(serializeSwimLane(lane));
        }
    }

    for (const activity of def.activities) {
        lines.push(serializeActivity(activity));
    }

    for (const transition of def.transitions) {
        lines.push(serializeTransition(transition));
    }

    for (const annotation of def.annotations) {
        lines.push(serializeAnnotation(annotation));
    }

    return lines.join('\n');
}

function serializeBpmnProcess(meta: ProcessMetadata): string {
    const attrs = buildAttrs({
        id: meta.id,
        name: meta.name,
        version: meta.version,
        ...(meta.author !== undefined ? { author: meta.author } : {}),
        ...(meta.category !== undefined ? { category: meta.category } : {}),
        ...(meta.cardIndex !== undefined ? { cardIndex: meta.cardIndex } : {}),
        ...(meta.serverId !== undefined ? { serverId: meta.serverId } : {}),
        ...(meta.publicProcess !== undefined ? { publicProcess: String(meta.publicProcess) } : {}),
        ...(meta.volume !== undefined ? { volume: meta.volume } : {}),
        ...(meta.expedient !== undefined ? { expedient: meta.expedient } : {}),
        ...(meta.managerMechanism !== undefined ? { managerMechanism: meta.managerMechanism } : {}),
        ...meta.extraAttributes,
    });
    return `  <bpmn2:BpmnProcess ${attrs}/>`;
}

function serializePool(pool: ProcessPool): string {
    const attrs = buildAttrs({ id: pool.id, name: pool.name, ...pool.extraAttributes });
    return `  <bpmn2:BpmnPool ${attrs}/>`;
}

function serializeSwimLane(lane: ProcessSwimlane): string {
    const attrs = buildAttrs({ id: lane.id, name: lane.name, ...lane.extraAttributes });
    return `  <bpmn2:BpmnSwimLane ${attrs}/>`;
}

function serializeActivity(activity: ProcessActivity): string {
    const base = {
        id: activity.id,
        name: activity.name,
        ...(activity.incoming.length > 0 ? { incoming: activity.incoming.join(' ') } : {}),
        ...(activity.outgoing.length > 0 ? { outgoing: activity.outgoing.join(' ') } : {}),
        type: String(activity.typeCode),
    };

    switch (activity.kind) {
        case 'start':
        case 'end':
        case 'end-cancel': {
            const tag = activity.kind === 'start' ? 'BpmnStartEvent' : 'BpmnEndEvent';
            return `  <bpmn2:${tag} ${buildAttrs({ ...base, ...activity.extraAttributes })}/>`;
        }

        case 'task':
        case 'service-task': {
            const t = activity as ProcessTaskActivity;
            const taskAttrs: Record<string, string> = { ...base };
            if (t.managerMechanism) { taskAttrs.managerMechanism = t.managerMechanism; }
            if (t.rawAssignmentXml) { taskAttrs.managerAssignmentControllerString = t.rawAssignmentXml; }
            if (t.scriptFileName)   { taskAttrs.scriptFileName = t.scriptFileName; }
            Object.assign(taskAttrs, t.extraAttributes);
            return `  <bpmn2:BpmnTask ${buildAttrs(taskAttrs)}/>`;
        }

        case 'gateway-exclusive': {
            const g = activity as ProcessGatewayActivity;
            const gwAttrs: Record<string, string> = { ...base };
            if (g.rawConditionXml) { gwAttrs.condition = g.rawConditionXml; }
            Object.assign(gwAttrs, g.extraAttributes);
            return `  <bpmn2:BpmnGateway ${buildAttrs(gwAttrs)}/>`;
        }

        case 'intermediate-link-throw':
        case 'intermediate-link-receive':
        case 'intermediate-error': {
            const ev = activity as ProcessIntermediateEventActivity;
            const evAttrs: Record<string, string> = { ...base };
            if (ev.linkId)     { evAttrs.linkId = ev.linkId; }
            if (ev.parentTask) { evAttrs.parentTask = ev.parentTask; }
            Object.assign(evAttrs, ev.extraAttributes);
            return `  <bpmn2:BpmnIntermediateEvent ${buildAttrs(evAttrs)}/>`;
        }

        case 'subprocess': {
            const sub = activity as ProcessSubProcessActivity;
            const subAttrs: Record<string, string> = { ...base };
            if (sub.process) { subAttrs.process = sub.process; }
            Object.assign(subAttrs, sub.extraAttributes);
            return `  <bpmn2:BpmnSubProcess ${buildAttrs(subAttrs)}/>`;
        }
    }
}

function serializeTransition(t: ProcessTransition): string {
    const attrs = buildAttrs({
        id: t.id,
        name: t.name,
        sourceRef: t.sourceRef,
        targetRef: t.targetRef,
        ...t.extraAttributes,
    });
    return `  <bpmn2:SequenceFlow ${attrs}/>`;
}

function serializeAnnotation(a: ProcessAnnotation): string {
    return `  <bpmn2:BpmnAnnotation ${buildAttrs({ id: a.id, name: a.name })}/>`;
}

// ── Montagem final ────────────────────────────────────────────────────────

function assembleXml(
    emf: EmfDiagram,
    pictogramLinks: string,
    shapes: EmfShape[],
    connections: EmfConnection[],
    businessXml: string
): string {
    const diagramOpenTag =
        `<pi:Diagram visible="true" gridUnit="${emf.gridUnit}" diagramTypeId="BPMNdiagram"` +
        ` name="${escapeXmlAttr(emf.name)}" snapToGrid="true" showGuides="true"` +
        ` pictogramLinks="${pictogramLinks}" version="${escapeXmlAttr(emf.version)}">`;

    const shapesXml = shapes
        .sort((a, b) => a.childIndex - b.childIndex)
        .map(s => s.rawXml)
        .join('\n');

    const connectionsXml = connections
        .sort((a, b) => a.connectionIndex - b.connectionIndex)
        .map(c => c.rawXml)
        .join('\n');

    const piDiagram = [
        `  ${diagramOpenTag}`,
        emf.rawPreamble.trimEnd(),
        emf.pool.rawXml,
        shapesXml,
        connectionsXml,
        '  </pi:Diagram>',
    ].join('\n');

    return [
        '<?xml version="1.0" encoding="ASCII"?>',
        '<xmi:XMI xmi:version="2.0"' +
        ' xmlns:xmi="http://www.omg.org/XMI"' +
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
        ' xmlns:al="http://eclipse.org/graphiti/mm/algorithms"' +
        ' xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL-XMI"' +
        ' xmlns:pi="http://eclipse.org/graphiti/mm/pictograms">',
        piDiagram,
        businessXml,
        '</xmi:XMI>',
        '',
    ].join('\n');
}

// ── Helpers de XML ────────────────────────────────────────────────────────

/**
 * Serializa um objeto Record<string, string> como atributos XML.
 * Valores são XML-encodificados (incluindo newlines → &#xA;).
 */
function buildAttrs(attrs: Record<string, string | undefined>): string {
    return Object.entries(attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${escapeXmlAttr(v!)}"`)
        .join(' ');
}

/**
 * Encodifica um valor para uso em atributo XML:
 * & → &amp;  < → &lt;  > → &gt;  " → &quot;  newline → &#xA;
 */
export function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '&#xA;')
        .replace(/\r/g, '&#xD;');
}
