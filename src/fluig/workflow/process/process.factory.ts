import type { ProcessDefinition, ProcessPool, ProcessSwimlane } from './process.types';
import type { EmfDiagram, EmfPool, EmfShape, EmfConnection } from './process.emf-model';
import { buildShapeXml, buildConnectionXml } from './process.shape-template';
import { serializeProcess } from './process.serializer';

export interface NewProcessOptions {
    /** Identificador único do processo — usado como base para IDs internos e nome do arquivo. */
    id: string;
    /** Nome de exibição do processo. */
    name: string;
    /** Nome da swimlane inicial. Default: "Geral". */
    swimlaneName?: string;
    /** Versão. Default: "1". */
    version?: string;
}

/**
 * Cria um ProcessDefinition + EmfDiagram mínimo válido:
 * start → tarefa → fim, com 1 pool e 1 swimlane.
 *
 * O XML resultante (`serializeProcess(def, emf)`) é aceito pelo Fluig Designer
 * e pelo preview visual da extensão.
 */
export function createMinimalProcess(opts: NewProcessOptions): { def: ProcessDefinition; emf: EmfDiagram } {
    const { id, name } = opts;
    const swimlaneName = opts.swimlaneName ?? 'Geral';
    const version = opts.version ?? '1';

    const poolId   = `${id}_pool`;
    const laneId   = `${id}_lane`;
    const startId  = `${id}_start`;
    const taskId   = `${id}_task`;
    const endId    = `${id}_end`;
    const flow1Id  = `${id}_flow1`;
    const flow2Id  = `${id}_flow2`;

    // ── Business layer ──────────────────────────────────────────────────
    const swimlane: ProcessSwimlane = { id: laneId, name: swimlaneName,
        coords: { x: 30, y: 0, width: 570, height: 200 } };

    const pool: ProcessPool = { id: poolId, name,
        coords: { x: 20, y: 20, width: 600, height: 200 },
        swimlanes: [swimlane] };

    const def: ProcessDefinition = {
        metadata: { id, name, version, publicProcess: false },
        pool,
        activities: [
            { id: startId, name: 'Início', kind: 'start', typeCode: 10,
              coords: { x: 70, y: 90, width: 35, height: 35 },
              incoming: [], outgoing: [flow1Id] },
            { id: taskId, name: 'Tarefa', kind: 'task', typeCode: 80,
              coords: { x: 170, y: 80, width: 106, height: 82 },
              incoming: [flow1Id], outgoing: [flow2Id],
              managerMechanism: 'Papel' } as any,
            { id: endId, name: 'Fim', kind: 'end', typeCode: 0,
              coords: { x: 360, y: 90, width: 35, height: 35 },
              incoming: [flow2Id], outgoing: [] },
        ],
        transitions: [
            { id: flow1Id, name: '', sourceRef: startId, targetRef: taskId },
            { id: flow2Id, name: '', sourceRef: taskId,  targetRef: endId },
        ],
        annotations: [],
    };

    // ── Pictogram layer ─────────────────────────────────────────────────
    const poolRawXml = buildPoolXml(poolId, laneId, swimlaneName);

    const shapes: EmfShape[] = [
        {
            businessId: startId, childIndex: 1,
            rawXml: buildShapeXml({ businessId: startId, kind: 'start', label: 'Início',
                x: 70, y: 90, childIndex: 1 }),
            outgoingFlowIds: [flow1Id], incomingFlowIds: [],
        },
        {
            businessId: taskId, childIndex: 2,
            rawXml: buildShapeXml({ businessId: taskId, kind: 'task', label: 'Tarefa',
                x: 170, y: 80, childIndex: 2 }),
            outgoingFlowIds: [flow2Id], incomingFlowIds: [flow1Id],
        },
        {
            businessId: endId, childIndex: 3,
            rawXml: buildShapeXml({ businessId: endId, kind: 'end', label: 'Fim',
                x: 360, y: 90, childIndex: 3 }),
            outgoingFlowIds: [], incomingFlowIds: [flow2Id],
        },
    ];

    const connections: EmfConnection[] = [
        { businessId: flow1Id, connectionIndex: 0, rawXml: buildConnectionXml(flow1Id, ''),
          sourceBusinessId: startId, targetBusinessId: taskId },
        { businessId: flow2Id, connectionIndex: 1, rawXml: buildConnectionXml(flow2Id, ''),
          sourceBusinessId: taskId, targetBusinessId: endId },
    ];

    const emf: EmfDiagram = {
        name: id,
        gridUnit: '10',
        version: '0.11.0',
        rawPreamble: MINIMAL_PREAMBLE,
        pool: { businessId: poolId, rawXml: poolRawXml, swimlaneCount: 1 },
        shapes,
        connections,
    };

    return { def, emf };
}

/**
 * Serializa diretamente para XML .process.
 * Atalho para `serializeProcess(createMinimalProcess(opts).def, createMinimalProcess(opts).emf)`.
 */
export function createMinimalProcessXml(opts: NewProcessOptions): string {
    const { def, emf } = createMinimalProcess(opts);
    return serializeProcess(def, emf);
}

// ── Preamble mínimo ───────────────────────────────────────────────────────

/**
 * Preamble mínimo que garante:
 * - /0/@colors.0  = cinza escuro (texto)
 * - /0/@colors.1  = azul
 * - /0/@colors.2  = transparente (para borders sem fill)
 * - /0/@fonts.0   = Arial 8
 * - /0/@fonts.1   = Arial 8 bold
 * - /0/@fonts.2   = Arial 11 bold  ← referenciado pelos shape templates
 */
const MINIMAL_PREAMBLE = `
    <graphicsAlgorithm xsi:type="al:Rectangle" width="1000" height="1000"/>
    <styles foreground="/0/@colors.0" lineWidth="1"/>
    <styles foreground="/0/@colors.1" lineWidth="1" filled="false"/>
    <styles foreground="/0/@colors.0" lineWidth="1"/>
    <colors red="51" green="51" blue="51"/>
    <colors red="51" green="51" blue="153"/>
    <colors/>
    <fonts name="Arial" size="8"/>
    <fonts name="Arial" size="8" bold="true"/>
    <fonts name="Arial" size="11" bold="true"/>`;

// ── Pool rawXml ───────────────────────────────────────────────────────────

function buildPoolXml(poolId: string, laneId: string, swimlaneName: string): string {
    const sw = escXml(swimlaneName);
    return [
        `    <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `      <graphicsAlgorithm xsi:type="al:Rectangle" lineWidth="1" transparency="0.0"`,
        `        width="600" height="200" x="20" y="20"/>`,
        `      <link businessObjects="${poolId}"/>`,
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `        <graphicsAlgorithm xsi:type="al:Rectangle" lineWidth="1" transparency="0.0"`,
        `          width="570" height="200" x="30" y="0"/>`,
        `        <link businessObjects="${laneId}"/>`,
        `        <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `        <children visible="true">`,
        `          <graphicsAlgorithm xsi:type="al:Text" lineWidth="1" filled="false"`,
        `            width="30" height="200" font="/0/@fonts.2"`,
        `            horizontalAlignment="ALIGNMENT_CENTER" verticalAlignment="ALIGNMENT_MIDDLE"`,
        `            angle="270" value="${sw}" rotation="270.0"/>`,
        `        </children>`,
        `      </children>`,
        `    </children>`,
    ].join('\n');
}

function escXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
