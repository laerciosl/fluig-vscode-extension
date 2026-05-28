import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseProcess } from '../../../src/fluig/workflow/process/process.parser';
import { extractEmfDiagram } from '../../../src/fluig/workflow/process/process.emf-parser';
import { serializeProcess } from '../../../src/fluig/workflow/process/process.serializer';
import type { ProcessDefinition } from '../../../src/fluig/workflow/process/process.types';
import type { EmfDiagram } from '../../../src/fluig/workflow/process/process.emf-model';

// ── Helpers ───────────────────────────────────────────────────────────────

function loadFixture(name: string): string {
    return readFileSync(join(__dirname, '../../fixtures/process', name), 'utf-8');
}

function roundTrip(xml: string): { def1: ProcessDefinition; def2: ProcessDefinition; emf: EmfDiagram; xml2: string } {
    const def1 = parseProcess(xml);
    const emf  = extractEmfDiagram(xml);
    const xml2 = serializeProcess(def1, emf);
    const def2 = parseProcess(xml2);
    return { def1, def2, emf, xml2 };
}

// ── Fixture simples ───────────────────────────────────────────────────────

describe('simple.process — round-trip semântico', () => {
    let xml: string;
    let def1: ProcessDefinition;
    let def2: ProcessDefinition;
    let emf: EmfDiagram;

    beforeAll(() => {
        xml = loadFixture('simple.process');
        ({ def1, def2, emf } = roundTrip(xml));
    });

    it('extrai EMF com pool correto', () => {
        expect(emf.pool.businessId).toBe('pool1');
        expect(emf.pool.swimlaneCount).toBe(1);
    });

    it('extrai 3 shapes de atividade', () => {
        expect(emf.shapes).toHaveLength(3);
        const ids = emf.shapes.map(s => s.businessId);
        expect(ids).toContain('start1');
        expect(ids).toContain('task1');
        expect(ids).toContain('end1');
    });

    it('extrai 2 connections', () => {
        expect(emf.connections).toHaveLength(2);
        const ids = emf.connections.map(c => c.businessId);
        expect(ids).toContain('flow1');
        expect(ids).toContain('flow2');
    });

    it('connections têm source/target corretos', () => {
        const flow1 = emf.connections.find(c => c.businessId === 'flow1')!;
        const flow2 = emf.connections.find(c => c.businessId === 'flow2')!;
        expect(flow1.sourceBusinessId).toBe('start1');
        expect(flow1.targetBusinessId).toBe('task1');
        expect(flow2.sourceBusinessId).toBe('task1');
        expect(flow2.targetBusinessId).toBe('end1');
    });

    it('metadata preservada no round-trip', () => {
        expect(def2.metadata.id).toBe(def1.metadata.id);
        expect(def2.metadata.name).toBe(def1.metadata.name);
        expect(def2.metadata.version).toBe(def1.metadata.version);
    });

    it('pool e swimlanes preservados', () => {
        expect(def2.pool?.id).toBe(def1.pool?.id);
        expect(def2.pool?.name).toBe(def1.pool?.name);
        expect(def2.pool?.swimlanes).toHaveLength(def1.pool?.swimlanes.length ?? 0);
    });

    it('atividades preservadas', () => {
        expect(def2.activities).toHaveLength(def1.activities.length);
        for (const a1 of def1.activities) {
            const a2 = def2.activities.find(a => a.id === a1.id);
            expect(a2, `atividade ${a1.id} não encontrada`).toBeDefined();
            expect(a2!.name).toBe(a1.name);
            expect(a2!.kind).toBe(a1.kind);
            expect(a2!.incoming).toEqual(a1.incoming);
            expect(a2!.outgoing).toEqual(a1.outgoing);
        }
    });

    it('transitions preservadas', () => {
        expect(def2.transitions).toHaveLength(def1.transitions.length);
        for (const t1 of def1.transitions) {
            const t2 = def2.transitions.find(t => t.id === t1.id);
            expect(t2, `transition ${t1.id} não encontrada`).toBeDefined();
            expect(t2!.sourceRef).toBe(t1.sourceRef);
            expect(t2!.targetRef).toBe(t1.targetRef);
        }
    });

    it('XML serializado contém o processo', () => {
        const xml2 = serializeProcess(def1, emf);
        expect(xml2).toContain('id="simple"');
        expect(xml2).toContain('bpmn2:BpmnTask');
        expect(xml2).toContain('bpmn2:SequenceFlow');
        expect(xml2).toContain('pi:Diagram');
        expect(xml2).toContain('pi:FreeFormConnection');
    });
});

// ── Fixture repair_shop (integração) ─────────────────────────────────────

describe('repair_shop.process — round-trip semântico', () => {
    let def1: ProcessDefinition;
    let def2: ProcessDefinition;
    let emf: EmfDiagram;

    beforeAll(() => {
        const xml = loadFixture('repair_shop.process');
        ({ def1, def2, emf } = roundTrip(xml));
    });

    it('extrai pool com 6+ swimlanes', () => {
        expect(emf.pool.businessId).toBe('pool1');
        expect(emf.pool.swimlaneCount).toBeGreaterThanOrEqual(6);
    });

    it('extrai todas as atividades como shapes', () => {
        expect(emf.shapes.length).toBeGreaterThanOrEqual(80);
    });

    it('extrai todas as connections', () => {
        expect(emf.connections.length).toBeGreaterThanOrEqual(85);
    });

    it('todas as connections têm source e target preenchidos', () => {
        const empty = emf.connections.filter(c => !c.sourceBusinessId || !c.targetBusinessId);
        expect(empty).toHaveLength(0);
    });

    it('metadata preservada no round-trip', () => {
        expect(def2.metadata.id).toBe('repair_shop');
        expect(def2.metadata.name).toBe(def1.metadata.name);
        expect(def2.metadata.version).toBe(def1.metadata.version);
    });

    it('mesma quantidade de atividades', () => {
        expect(def2.activities).toHaveLength(def1.activities.length);
    });

    it('mesma quantidade de transitions', () => {
        expect(def2.transitions).toHaveLength(def1.transitions.length);
    });

    it('mesma quantidade de swimlanes', () => {
        expect(def2.pool?.swimlanes).toHaveLength(def1.pool?.swimlanes.length ?? 0);
    });

    it('nomes das atividades preservados', () => {
        for (const a1 of def1.activities) {
            const a2 = def2.activities.find(a => a.id === a1.id);
            expect(a2?.name, `nome de ${a1.id}`).toBe(a1.name);
        }
    });

    it('kinds das atividades preservados', () => {
        for (const a1 of def1.activities) {
            const a2 = def2.activities.find(a => a.id === a1.id);
            expect(a2?.kind, `kind de ${a1.id}`).toBe(a1.kind);
        }
    });

    it('incoming/outgoing das atividades preservados', () => {
        for (const a1 of def1.activities) {
            const a2 = def2.activities.find(a => a.id === a1.id);
            expect(a2?.incoming.sort(), `incoming de ${a1.id}`).toEqual(a1.incoming.sort());
            expect(a2?.outgoing.sort(), `outgoing de ${a1.id}`).toEqual(a1.outgoing.sort());
        }
    });

    it('assignment de tasks preservado', () => {
        const tasks1 = def1.activities.filter(a => a.kind === 'task' || a.kind === 'service-task');
        for (const t1 of tasks1) {
            const t2 = def2.activities.find(a => a.id === t1.id);
            if (!t1.extraAttributes?.managerAssignmentControllerString) { continue; }
            // Verifica que o atributo round-tripou
            expect(t2?.extraAttributes?.managerAssignmentControllerString ?? (t2 as any)?.rawAssignmentXml)
                .toBeTruthy();
        }
    });

    it('sourceRef/targetRef das transitions preservados', () => {
        for (const t1 of def1.transitions) {
            const t2 = def2.transitions.find(t => t.id === t1.id);
            expect(t2?.sourceRef, `sourceRef de ${t1.id}`).toBe(t1.sourceRef);
            expect(t2?.targetRef, `targetRef de ${t1.id}`).toBe(t1.targetRef);
        }
    });
});

// ── EMF refs ──────────────────────────────────────────────────────────────

describe('pictogramLinks e connection refs', () => {
    let emf: EmfDiagram;
    let xml2: string;

    beforeAll(() => {
        const xml = loadFixture('simple.process');
        const def1 = parseProcess(xml);
        emf = extractEmfDiagram(xml);
        xml2 = serializeProcess(def1, emf);
    });

    it('pictogramLinks contém ref do pool', () => {
        expect(xml2).toContain('/0/@children.0/@link');
    });

    it('pictogramLinks contém refs das atividades', () => {
        expect(xml2).toContain('/0/@children.1/@link');
        expect(xml2).toContain('/0/@children.2/@link');
        expect(xml2).toContain('/0/@children.3/@link');
    });

    it('pictogramLinks contém refs das connections', () => {
        expect(xml2).toContain('/0/@connections.0/@link');
        expect(xml2).toContain('/0/@connections.1/@link');
    });

    it('connection start/end apontam para childIndexes corretos', () => {
        const startIdx = emf.shapes.find(s => s.businessId === 'start1')?.childIndex;
        const taskIdx  = emf.shapes.find(s => s.businessId === 'task1')?.childIndex;
        const endIdx   = emf.shapes.find(s => s.businessId === 'end1')?.childIndex;

        expect(xml2).toContain(`start="/0/@children.${startIdx}/@anchors.0"`);
        expect(xml2).toContain(`end="/0/@children.${taskIdx}/@anchors.0"`);
        expect(xml2).toContain(`start="/0/@children.${taskIdx}/@anchors.0"`);
        expect(xml2).toContain(`end="/0/@children.${endIdx}/@anchors.0"`);
    });

    it('outgoingConnections/incomingConnections nos anchors estão corretos', () => {
        expect(xml2).toContain('outgoingConnections="/0/@connections.0"');
        expect(xml2).toContain('incomingConnections="/0/@connections.0"');
        expect(xml2).toContain('outgoingConnections="/0/@connections.1"');
        expect(xml2).toContain('incomingConnections="/0/@connections.1"');
    });
});
