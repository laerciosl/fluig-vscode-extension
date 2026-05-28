import {
    ActivityKind,
    ProcessActivity,
    ProcessDefinition,
    ProcessSubProcessActivity,
    ProcessTaskActivity,
} from './process.types';

/**
 * Modelo intermediário de renderização — independente de tecnologia visual.
 * Posições e dimensões já em pixels (coordenadas extraídas do pictograma).
 */
export interface RenderNode {
    id: string;
    /** Classe semântica do elemento (drives styling). */
    kind: NodeKind;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Para service-task: nome do .js. */
    scriptFileName?: string;
    /** Para subprocess: id do processo filho. */
    process?: string;
    /** Mecanismo de atribuição (para tooltip). */
    managerMechanism?: string;
    /** Papel ou grupo associado (para tooltip). */
    roleId?: string;
    groupId?: string;
}

export type NodeKind = ActivityKind | 'pool' | 'swimlane' | 'annotation';

export interface RenderEdgeWaypoint {
    x: number;
    y: number;
}

export interface RenderEdge {
    id: string;
    label: string;
    sourceId: string;
    targetId: string;
    waypoints: RenderEdgeWaypoint[];
}

export interface RenderModel {
    processId: string;
    processName: string;
    processVersion: string;
    /** Bounding box útil para o SVG (com padding). */
    viewBox: { x: number; y: number; width: number; height: number };
    pools: RenderNode[];
    swimlanes: RenderNode[];
    activities: RenderNode[];
    annotations: RenderNode[];
    edges: RenderEdge[];
}

const PADDING = 40;
const DEFAULT_NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
    'start': { width: 35, height: 35 },
    'end': { width: 35, height: 35 },
    'end-cancel': { width: 35, height: 35 },
    'task': { width: 106, height: 82 },
    'service-task': { width: 106, height: 100 },
    'subprocess': { width: 105, height: 82 },
    'gateway-exclusive': { width: 60, height: 60 },
    'intermediate-link-throw': { width: 35, height: 35 },
    'intermediate-link-receive': { width: 35, height: 35 },
    'intermediate-error': { width: 30, height: 30 },
    'pool': { width: 600, height: 300 },
    'swimlane': { width: 600, height: 100 },
    'annotation': { width: 160, height: 100 },
};

export function buildRenderModel(def: ProcessDefinition): RenderModel {
    const activities = def.activities.map(activityToNode);
    const annotations = def.annotations
        .filter(a => a.coords)
        .map(a => ({
            id: a.id,
            kind: 'annotation' as NodeKind,
            label: a.name,
            ...a.coords!,
        }));

    const swimlanes = (def.pool?.swimlanes ?? [])
        .filter(l => l.coords)
        .map(l => ({
            id: l.id,
            kind: 'swimlane' as NodeKind,
            label: l.name,
            ...l.coords!,
        }));

    const pools: RenderNode[] = def.pool?.coords
        ? [{
            id: def.pool.id,
            kind: 'pool' as NodeKind,
            label: def.pool.name,
            ...def.pool.coords,
        }]
        : [];

    const nodesById = new Map<string, RenderNode>();
    for (const node of [...activities, ...annotations, ...swimlanes, ...pools]) {
        nodesById.set(node.id, node);
    }

    const edges: RenderEdge[] = def.transitions.flatMap(t => {
        const source = nodesById.get(t.sourceRef);
        const target = nodesById.get(t.targetRef);
        if (!source || !target) {
            return [];
        }
        return [{
            id: t.id,
            label: t.name,
            sourceId: t.sourceRef,
            targetId: t.targetRef,
            waypoints: routeEdge(source, target),
        }];
    });

    const viewBox = computeViewBox([...activities, ...annotations, ...swimlanes, ...pools]);

    return {
        processId: def.metadata.id,
        processName: def.metadata.name,
        processVersion: def.metadata.version,
        viewBox,
        pools,
        swimlanes,
        activities,
        annotations,
        edges,
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function activityToNode(activity: ProcessActivity): RenderNode {
    let coords = activity.coords ?? defaultCoordsFor(activity.kind);

    if (activity.kind === 'gateway-exclusive' && coords.height > coords.width * 1.1) {
        // Fluig/Graphiti stores the gateway as a ContainerShape whose outer rect
        // includes the text-label area below the diamond. Normalize to a square
        // so the diamond renders correctly and the floating label isn't pushed down
        // by 60–80 extra pixels.
        coords = { x: coords.x, y: coords.y, width: coords.width, height: coords.width };
    }

    const node: RenderNode = {
        id: activity.id,
        kind: activity.kind,
        label: activity.name,
        ...coords,
    };

    if (activity.kind === 'service-task') {
        const t = activity as ProcessTaskActivity;
        node.scriptFileName = t.scriptFileName;
    }

    if (activity.kind === 'task' || activity.kind === 'service-task') {
        const t = activity as ProcessTaskActivity;
        node.managerMechanism = t.managerMechanism;
        node.roleId = t.assignment?.roleId;
        node.groupId = t.assignment?.groupId;
    }

    if (activity.kind === 'subprocess') {
        const sub = activity as ProcessSubProcessActivity;
        node.process = sub.process;
    }

    return node;
}

function defaultCoordsFor(kind: NodeKind): { x: number; y: number; width: number; height: number } {
    const size = DEFAULT_NODE_SIZE[kind];
    return { x: 0, y: 0, width: size.width, height: size.height };
}

/**
 * Roteamento de aresta simples: linha reta entre centros dos nós, com
 * pontos de borda como início/fim para que a seta encoste na forma e não
 * fique escondida atrás dela.
 */
function routeEdge(source: RenderNode, target: RenderNode): RenderEdgeWaypoint[] {
    const s = centerOf(source);
    const t = centerOf(target);
    const start = projectToEdge(source, s, t);
    const end = projectToEdge(target, t, s);
    return [start, end];
}

function centerOf(node: RenderNode): RenderEdgeWaypoint {
    return {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
    };
}

/**
 * Projeta o ponto `from` na borda do retângulo de `node`, voltando-se
 * para o ponto `toward`. Aproximação retangular — boa o suficiente para
 * gateways e círculos sem sobressair muito.
 */
function projectToEdge(
    node: RenderNode,
    from: RenderEdgeWaypoint,
    toward: RenderEdgeWaypoint
): RenderEdgeWaypoint {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    if (dx === 0 && dy === 0) {
        return from;
    }
    const hw = node.width / 2;
    const hh = node.height / 2;
    const scaleX = dx === 0 ? Infinity : hw / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : hh / Math.abs(dy);
    const scale = Math.min(scaleX, scaleY);
    return {
        x: from.x + dx * scale,
        y: from.y + dy * scale,
    };
}

function computeViewBox(nodes: RenderNode[]): { x: number; y: number; width: number; height: number } {
    if (nodes.length === 0) {
        return { x: 0, y: 0, width: 800, height: 600 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        if (n.x < minX) { minX = n.x; }
        if (n.y < minY) { minY = n.y; }
        if (n.x + n.width > maxX) { maxX = n.x + n.width; }
        if (n.y + n.height > maxY) { maxY = n.y + n.height; }
    }
    return {
        x: minX - PADDING,
        y: minY - PADDING,
        width: (maxX - minX) + PADDING * 2,
        height: (maxY - minY) + PADDING * 2,
    };
}
