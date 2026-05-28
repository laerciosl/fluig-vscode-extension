import { XMLParser } from 'fast-xml-parser';
import {
    Coordinates,
    ProcessActivity,
    ProcessAnnotation,
    ProcessDefinition,
    ProcessMetadata,
    ProcessPool,
    ProcessSwimlane,
    ProcessTransition,
} from './process.types';
import {
    decodeTypeCode,
    parseAssignment,
    parseConditions,
    splitFlows,
} from './process.mapper';

/** Tags do modelo bpmn2 que aparecem como filhos diretos de `xmi:XMI`. */
const ARRAY_TAGS = new Set([
    'bpmn2:BpmnPool',
    'bpmn2:BpmnSwimLane',
    'bpmn2:BpmnStartEvent',
    'bpmn2:BpmnEndEvent',
    'bpmn2:BpmnTask',
    'bpmn2:BpmnGateway',
    'bpmn2:BpmnIntermediateEvent',
    'bpmn2:BpmnSubProcess',
    'bpmn2:BpmnAnnotation',
    'bpmn2:SequenceFlow',
    'children',
    'connections',
    'anchors',
    'bendpoints',
]);

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
});

interface RawNode {
    [key: string]: unknown;
}

/**
 * Parseia um arquivo `.process` Fluig.
 *
 * @throws Se o XML for inválido ou se faltar a tag raiz `xmi:XMI` / `bpmn2:BpmnProcess`.
 */
export function parseProcess(xml: string): ProcessDefinition {
    const parsed = xmlParser.parse(xml) as RawNode;
    const root = parsed['xmi:XMI'] as RawNode | undefined;
    if (!root) {
        throw new Error('Arquivo .process inválido: tag raiz <xmi:XMI> ausente.');
    }

    const processNode = root['bpmn2:BpmnProcess'] as RawNode | undefined;
    if (!processNode) {
        throw new Error('Arquivo .process inválido: <bpmn2:BpmnProcess> ausente.');
    }

    const diagram = root['pi:Diagram'] as RawNode | undefined;
    const coordsByBusinessId = diagram ? extractCoordinatesMap(diagram) : new Map<string, Coordinates>();

    const metadata = buildMetadata(processNode);
    const pool = buildPool(root, coordsByBusinessId);
    const annotations = buildAnnotations(root, coordsByBusinessId);
    const activities = buildActivities(root, coordsByBusinessId);
    const transitions = buildTransitions(root);

    return {
        metadata,
        pool,
        activities,
        transitions,
        annotations,
    };
}

// ── Metadata ──────────────────────────────────────────────────────────────

function buildMetadata(processNode: RawNode): ProcessMetadata {
    return {
        id: attr(processNode, 'id') ?? '',
        name: attr(processNode, 'name') ?? '',
        version: attr(processNode, 'version') ?? '',
        author: attr(processNode, 'author'),
        category: attr(processNode, 'category'),
        cardIndex: attr(processNode, 'cardIndex'),
        serverId: attr(processNode, 'serverId'),
        publicProcess: attr(processNode, 'publicProcess') === 'true',
        volume: attr(processNode, 'volume'),
        expedient: attr(processNode, 'expedient'),
        managerMechanism: attr(processNode, 'managerMechanism'),
    };
}

// ── Pool & Swimlanes ──────────────────────────────────────────────────────

function buildPool(root: RawNode, coords: Map<string, Coordinates>): ProcessPool | undefined {
    const pools = asArray<RawNode>(root['bpmn2:BpmnPool']);
    if (pools.length === 0) {
        return undefined;
    }
    const first = pools[0];
    const id = attr(first, 'id') ?? '';
    const swimlanes: ProcessSwimlane[] = asArray<RawNode>(root['bpmn2:BpmnSwimLane']).map(lane => {
        const laneId = attr(lane, 'id') ?? '';
        return {
            id: laneId,
            name: attr(lane, 'name') ?? '',
            coords: coords.get(laneId),
        };
    });
    return {
        id,
        name: attr(first, 'name') ?? '',
        coords: coords.get(id),
        swimlanes,
    };
}

// ── Annotations ───────────────────────────────────────────────────────────

function buildAnnotations(root: RawNode, coords: Map<string, Coordinates>): ProcessAnnotation[] {
    return asArray<RawNode>(root['bpmn2:BpmnAnnotation']).map(node => {
        const id = attr(node, 'id') ?? '';
        return {
            id,
            name: attr(node, 'name') ?? '',
            coords: coords.get(id),
        };
    });
}

// ── Activities ────────────────────────────────────────────────────────────

function buildActivities(root: RawNode, coords: Map<string, Coordinates>): ProcessActivity[] {
    const out: ProcessActivity[] = [];

    const tagsToProcess: { tag: string; key: string }[] = [
        { tag: 'BpmnStartEvent', key: 'bpmn2:BpmnStartEvent' },
        { tag: 'BpmnEndEvent', key: 'bpmn2:BpmnEndEvent' },
        { tag: 'BpmnTask', key: 'bpmn2:BpmnTask' },
        { tag: 'BpmnGateway', key: 'bpmn2:BpmnGateway' },
        { tag: 'BpmnIntermediateEvent', key: 'bpmn2:BpmnIntermediateEvent' },
        { tag: 'BpmnSubProcess', key: 'bpmn2:BpmnSubProcess' },
    ];

    for (const { tag, key } of tagsToProcess) {
        for (const node of asArray<RawNode>(root[key])) {
            const activity = buildActivity(tag, node, coords);
            if (activity) {
                out.push(activity);
            }
        }
    }

    return out;
}

function buildActivity(tag: string, node: RawNode, coords: Map<string, Coordinates>): ProcessActivity | null {
    const id = attr(node, 'id') ?? '';
    const name = attr(node, 'name') ?? '';
    const typeCode = parseInt(attr(node, 'type') ?? '0', 10) || 0;
    const incoming = splitFlows(attr(node, 'incoming'));
    const outgoing = splitFlows(attr(node, 'outgoing'));

    const kind = decodeTypeCode(tag, typeCode);
    if (!kind) {
        return null;
    }

    const base = { id, name, typeCode, coords: coords.get(id), incoming, outgoing };

    if (kind === 'task' || kind === 'service-task') {
        const managerMechanism = attr(node, 'managerMechanism') || undefined;
        return {
            ...base,
            kind,
            managerMechanism,
            assignment: parseAssignment(attr(node, 'managerAssignmentControllerString'), managerMechanism),
            scriptFileName: kind === 'service-task' ? attr(node, 'scriptFileName') : undefined,
        };
    }

    if (kind === 'gateway-exclusive') {
        return {
            ...base,
            kind,
            conditions: parseConditions(attr(node, 'condition')),
        };
    }

    if (
        kind === 'intermediate-link-throw' ||
        kind === 'intermediate-link-receive' ||
        kind === 'intermediate-error'
    ) {
        return {
            ...base,
            kind,
            linkId: attr(node, 'linkId'),
            parentTask: attr(node, 'parentTask'),
        };
    }

    if (kind === 'subprocess') {
        return {
            ...base,
            kind,
            process: attr(node, 'process'),
        };
    }

    // start / end / end-cancel
    return { ...base, kind };
}

// ── Transitions ───────────────────────────────────────────────────────────

function buildTransitions(root: RawNode): ProcessTransition[] {
    return asArray<RawNode>(root['bpmn2:SequenceFlow']).map(node => ({
        id: attr(node, 'id') ?? '',
        name: attr(node, 'name') ?? '',
        sourceRef: attr(node, 'sourceRef') ?? '',
        targetRef: attr(node, 'targetRef') ?? '',
    }));
}

// ── Pictogram coordinates ─────────────────────────────────────────────────

/**
 * Varre o `pi:Diagram` recursivamente coletando coordenadas indexadas pelo
 * id do business object (via `<link businessObjects="..."/>`).
 */
function extractCoordinatesMap(diagram: RawNode): Map<string, Coordinates> {
    const map = new Map<string, Coordinates>();
    walkPictogram(diagram, map);
    return map;
}

function walkPictogram(node: unknown, map: Map<string, Coordinates>): void {
    if (!node || typeof node !== 'object') {
        return;
    }
    const obj = node as RawNode;

    const link = obj.link as RawNode | undefined;
    const businessId = link ? attr(link, 'businessObjects') : undefined;
    if (businessId) {
        const coords = readCoordinates(obj);
        if (coords) {
            // Coordenadas podem aparecer várias vezes para o mesmo id (forma + texto).
            // A primeira ocorrência costuma ser a forma principal.
            if (!map.has(businessId)) {
                map.set(businessId, coords);
            }
        }
    }

    // Recursão em children/connections aninhados.
    for (const child of asArray<unknown>(obj.children)) {
        walkPictogram(child, map);
    }
    for (const conn of asArray<unknown>(obj.connections)) {
        walkPictogram(conn, map);
    }
}

function readCoordinates(node: RawNode): Coordinates | undefined {
    const ga = node.graphicsAlgorithm as RawNode | undefined;
    if (!ga) {
        return undefined;
    }
    // `graphicsAlgorithm` pode aninhar um `graphicsAlgorithmChildren` quando
    // o elemento tem uma forma interna (ex.: gateways desenham um Polygon dentro do Rectangle).
    // A largura/altura úteis ficam no nível externo.
    const x = parseFloat(attr(ga, 'x') ?? '0');
    const y = parseFloat(attr(ga, 'y') ?? '0');
    const width = parseFloat(attr(ga, 'width') ?? '0');
    const height = parseFloat(attr(ga, 'height') ?? '0');
    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
        return undefined;
    }
    if (width === 0 && height === 0) {
        return undefined;
    }
    return { x, y, width, height };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function attr(node: RawNode, name: string): string | undefined {
    const value = node[`@_${name}`];
    if (value === undefined || value === null) {
        return undefined;
    }
    return decodeXmlEntities(String(value));
}

/**
 * Decodifica references de caracteres XML (`&#xe7;`, `&#231;`) e as entidades
 * nomeadas básicas. O fast-xml-parser v5 não decodifica numeric refs em
 * valores de atributo por padrão, e o `.process` Fluig é serializado como
 * ASCII com caracteres não-ASCII expressos via `&#xNN;`.
 */
function decodeXmlEntities(s: string): string {
    if (!s.includes('&')) {
        return s;
    }
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function asArray<T>(value: unknown): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? (value as T[]) : [value as T];
}
