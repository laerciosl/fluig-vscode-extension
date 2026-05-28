import type { EmfDiagram, EmfPool, EmfShape, EmfConnection } from './process.emf-model';

/**
 * Extrai o modelo EMF do XML bruto de um arquivo `.process`.
 *
 * Usa extração por string (não fast-xml-parser) para preservar o rawXml
 * fiel de cada shape e connection, incluindo atributos de estilo/cor/fonte
 * que não fazem parte do ProcessDefinition.
 */
export function extractEmfDiagram(xml: string): EmfDiagram {
    const diagramInfo = extractDiagramTag(xml);
    const body = extractPiDiagramBody(xml);

    const { preamble, children: childBlocks, connections: connectionBlocks } = splitTopLevelBlocks(body);

    // @children.0 = pool
    const poolBlock = childBlocks[0] ?? '';
    const pool = buildPool(poolBlock);

    // @children.1..N = activities / annotations
    const shapes: EmfShape[] = childBlocks.slice(1).map((rawXml, i) => buildShape(rawXml, i + 1));

    // @connections.0..M
    const connections: EmfConnection[] = connectionBlocks.map((rawXml, i) => buildConnection(rawXml, i, shapes));

    // Preencher outgoing/incoming nas shapes com base nas connections
    linkShapeFlows(shapes, connections);

    return {
        name: diagramInfo.name,
        gridUnit: diagramInfo.gridUnit,
        version: diagramInfo.version,
        rawPreamble: preamble,
        pool,
        shapes,
        connections,
    };
}

// ── Extração do pi:Diagram ────────────────────────────────────────────────

interface DiagramTagInfo {
    name: string;
    gridUnit: string;
    version: string;
}

function extractDiagramTag(xml: string): DiagramTagInfo {
    const start = xml.indexOf('<pi:Diagram ');
    if (start < 0) {
        return { name: '', gridUnit: '10', version: '' };
    }
    const end = xml.indexOf('>', start);
    const tag = xml.substring(start, end + 1);
    return {
        name: extractAttrValue(tag, 'name') ?? '',
        gridUnit: extractAttrValue(tag, 'gridUnit') ?? '10',
        version: extractAttrValue(tag, 'version') ?? '',
    };
}

function extractPiDiagramBody(xml: string): string {
    const start = xml.indexOf('<pi:Diagram ');
    if (start < 0) {
        return '';
    }
    const openEnd = xml.indexOf('>', start);
    const closeTag = xml.indexOf('</pi:Diagram>');
    if (openEnd < 0 || closeTag < 0) {
        return '';
    }
    return xml.substring(openEnd + 1, closeTag);
}

// ── Divisão em blocos top-level ───────────────────────────────────────────

interface TopLevelBlocks {
    /** styles + colors + fonts como string raw (tudo antes do primeiro <children) */
    preamble: string;
    /** rawXml de cada <children> top-level do pi:Diagram, em ordem */
    children: string[];
    /** rawXml de cada <connections> top-level do pi:Diagram, em ordem */
    connections: string[];
}

function splitTopLevelBlocks(body: string): TopLevelBlocks {
    const children: string[] = [];
    const connections: string[] = [];

    // Encontrar início do primeiro <children top-level
    const firstChildren = indexOfTopLevelTag(body, 'children', 0);
    const preamble = firstChildren >= 0 ? body.substring(0, firstChildren) : body;

    let pos = firstChildren >= 0 ? firstChildren : body.length;

    while (pos < body.length) {
        // Pular espaço em branco
        while (pos < body.length && body[pos] <= ' ') {
            pos++;
        }
        if (pos >= body.length) {
            break;
        }

        if (body.startsWith('<children', pos) && isTagStart(body, pos + 9)) {
            const { block, end } = extractBlock(body, pos, 'children');
            children.push(block);
            pos = end;
        } else if (body.startsWith('<connections', pos) && isTagStart(body, pos + 12)) {
            const { block, end } = extractBlock(body, pos, 'connections');
            connections.push(block);
            pos = end;
        } else {
            pos++;
        }
    }

    return { preamble, children, connections };
}

/** Retorna true se o caractere em `pos` é espaço, `>` ou `/` (final de nome de tag). */
function isTagStart(s: string, pos: number): boolean {
    if (pos >= s.length) {
        return false;
    }
    const c = s[pos];
    return c === ' ' || c === '>' || c === '/' || c === '\t' || c === '\n' || c === '\r';
}

/**
 * Encontra a posição do primeiro `<tagName` top-level no texto,
 * ignorando ocorrências aninhadas.
 */
function indexOfTopLevelTag(body: string, tagName: string, startPos: number): number {
    const open = `<${tagName}`;
    let i = startPos;
    while (i < body.length) {
        const idx = body.indexOf(open, i);
        if (idx < 0) {
            return -1;
        }
        if (isTagStart(body, idx + open.length)) {
            return idx;
        }
        i = idx + open.length;
    }
    return -1;
}

/**
 * Extrai o bloco completo de um elemento XML a partir de `startPos`.
 * Usa contador de profundidade para lidar com elementos aninhados.
 */
function extractBlock(xml: string, startPos: number, tagName: string): { block: string; end: number } {
    const openTag = `<${tagName}`;
    const closeTag = `</${tagName}>`;
    let depth = 0;
    let i = startPos;

    while (i < xml.length) {
        // Verifica fechamento
        if (xml.startsWith(closeTag, i)) {
            depth--;
            i += closeTag.length;
            if (depth === 0) {
                return { block: xml.substring(startPos, i), end: i };
            }
            continue;
        }

        // Verifica abertura
        if (xml.startsWith(openTag, i) && isTagStart(xml, i + openTag.length)) {
            depth++;
            // Avança até o fim da tag de abertura para detectar self-close
            let j = i + openTag.length;
            while (j < xml.length && xml[j] !== '>') {
                j++;
            }
            if (j > 0 && xml[j - 1] === '/') {
                // Tag self-closing: não incrementa depth de verdade
                depth--;
                if (depth === 0) {
                    return { block: xml.substring(startPos, j + 1), end: j + 1 };
                }
            }
            i = j + 1;
            continue;
        }

        i++;
    }

    return { block: xml.substring(startPos), end: xml.length };
}

// ── Construtores de shapes e connections ─────────────────────────────────

function buildPool(rawXml: string): EmfPool {
    const businessId = extractBusinessId(rawXml) ?? 'pool1';
    const swimlaneCount = countLinkedChildren(rawXml);
    return { businessId, rawXml, swimlaneCount };
}

function buildShape(rawXml: string, childIndex: number): EmfShape {
    const businessId = extractBusinessId(rawXml) ?? `shape${childIndex}`;

    // Extrair outgoing/incoming do ChopboxAnchor
    const { outgoing, incoming } = extractAnchorConnectionRefs(rawXml);

    return {
        businessId,
        childIndex,
        rawXml,
        outgoingFlowIds: [],  // preenchido depois por linkShapeFlows
        incomingFlowIds: [],  // preenchido depois por linkShapeFlows
    };

    void outgoing; void incoming; // usados por linkShapeFlows via connections
}

function buildConnection(rawXml: string, connectionIndex: number, shapes: EmfShape[]): EmfConnection {
    const businessId = extractBusinessId(rawXml) ?? `conn${connectionIndex}`;

    // start="/0/@children.N/@anchors.0" → childIndex N
    const startRef = extractAttrValue(rawXml, 'start') ?? '';
    const endRef = extractAttrValue(rawXml, 'end') ?? '';

    const sourceChildIndex = parseChildIndexFromRef(startRef);
    const targetChildIndex = parseChildIndexFromRef(endRef);

    const sourceShape = shapes.find(s => s.childIndex === sourceChildIndex);
    const targetShape = shapes.find(s => s.childIndex === targetChildIndex);

    return {
        businessId,
        connectionIndex,
        rawXml,
        sourceBusinessId: sourceShape?.businessId ?? '',
        targetBusinessId: targetShape?.businessId ?? '',
    };
}

function linkShapeFlows(shapes: EmfShape[], connections: EmfConnection[]): void {
    for (const conn of connections) {
        if (conn.sourceBusinessId) {
            const src = shapes.find(s => s.businessId === conn.sourceBusinessId);
            if (src) {
                src.outgoingFlowIds.push(conn.businessId);
            }
        }
        if (conn.targetBusinessId) {
            const tgt = shapes.find(s => s.businessId === conn.targetBusinessId);
            if (tgt) {
                tgt.incomingFlowIds.push(conn.businessId);
            }
        }
    }
}

// ── Helpers de extração de XML ────────────────────────────────────────────

/**
 * Extrai o valor de um atributo XML de uma string (não parseia o XML completo).
 * Retorna undefined se o atributo não existir.
 */
function extractAttrValue(xml: string, attrName: string): string | undefined {
    // Casos: attrName="value" ou attrName='value'
    const dq = new RegExp(`\\b${attrName}="([^"]*)"`);
    const sq = new RegExp(`\\b${attrName}='([^']*)'`);
    const matchDq = dq.exec(xml);
    if (matchDq) {
        return matchDq[1];
    }
    const matchSq = sq.exec(xml);
    return matchSq ? matchSq[1] : undefined;
}

/** Extrai o businessId do `<link businessObjects="..."/>` dentro do rawXml. */
function extractBusinessId(rawXml: string): string | undefined {
    const match = /\bbusinessObjects="([^"]+)"/.exec(rawXml);
    return match ? match[1] : undefined;
}

/**
 * Conta quantos `<link businessObjects="swimlane..."/>` existem dentro do rawXml do pool.
 * Inclui também o texto label (sem link), por isso usamos o total de `<children` no pool.
 */
function countLinkedChildren(poolRawXml: string): number {
    // Conta o número de <children xsi:type="pi:ContainerShape" ou <children visible
    // DIRETOS do pool (depth 1 relativo ao pool)
    const body = poolRawXml.slice(poolRawXml.indexOf('>') + 1, poolRawXml.lastIndexOf('</children>'));
    let count = 0;
    let i = 0;
    while (i < body.length) {
        const idx = body.indexOf('<children', i);
        if (idx < 0) {
            break;
        }
        if (isTagStart(body, idx + 9)) {
            count++;
            // Saltar para o fim desta tag (não recursivo — conta apenas depth 1)
            const { end } = extractBlock(body, idx, 'children');
            i = end;
        } else {
            i = idx + 9;
        }
    }
    return count;
}

/**
 * Extrai refs de outgoing/incomingConnections do primeiro ChopboxAnchor do shape.
 * Retorna arrays de índices de connection (não businessIds).
 */
function extractAnchorConnectionRefs(rawXml: string): { outgoing: number[]; incoming: number[] } {
    const chopboxMatch = /xsi:type="pi:ChopboxAnchor"([^/]*?)(?:\/>|>)/.exec(rawXml);
    if (!chopboxMatch) {
        return { outgoing: [], incoming: [] };
    }
    const anchorAttrs = chopboxMatch[0];

    const outgoingRefs = extractAttrValue(anchorAttrs, 'outgoingConnections') ?? '';
    const incomingRefs = extractAttrValue(anchorAttrs, 'incomingConnections') ?? '';

    const outgoing = outgoingRefs.split(/\s+/).filter(Boolean).map(parseConnectionIndexFromRef).filter(n => n >= 0);
    const incoming = incomingRefs.split(/\s+/).filter(Boolean).map(parseConnectionIndexFromRef).filter(n => n >= 0);

    return { outgoing, incoming };
}

/** Extrai o childIndex de uma ref como `/0/@children.3/@anchors.0`. */
function parseChildIndexFromRef(ref: string): number {
    const match = /@children\.(\d+)/.exec(ref);
    return match ? parseInt(match[1], 10) : -1;
}

/** Extrai o connectionIndex de uma ref como `/0/@connections.5`. */
function parseConnectionIndexFromRef(ref: string): number {
    const match = /@connections\.(\d+)/.exec(ref);
    return match ? parseInt(match[1], 10) : -1;
}
