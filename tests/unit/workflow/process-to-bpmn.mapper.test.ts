import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { parseProcess } from '../../../src/fluig/workflow/process/process.parser';
import { extractEmfDiagram } from '../../../src/fluig/workflow/process/process.emf-parser';
import type { ProcessTaskActivity } from '../../../src/fluig/workflow/process/process.types';
import { convertProcessToBpmn } from '../../../src/fluig/workflow/process/process-to-bpmn.mapper';

const FIX = join(__dirname, '../../fixtures/process');

function load(file: string) {
    const def = parseProcess(readFileSync(join(FIX, file), 'utf-8'));
    return { def, conv: convertProcessToBpmn(def) };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

describe('convertProcessToBpmn', () => {
    for (const file of ['simple.process', 'repair_shop.process']) {
        describe(file, () => {
            it('gera XML BPMN bem-formado', () => {
                const { conv } = load(file);
                expect(conv.xml).toContain('<bpmn:definitions');
                // não lança = bem-formado
                expect(() => parser.parse(conv.xml)).not.toThrow();
            });

            it('idToFluig e fluigToId são inversos e sem colisão', () => {
                const { conv } = load(file);
                const bpmnIds = Object.keys(conv.idToFluig);
                const fluigIds = Object.keys(conv.fluigToId);
                expect(bpmnIds.length).toBe(fluigIds.length);
                expect(new Set(bpmnIds).size).toBe(bpmnIds.length); // ids bpmn únicos
                for (const [bpmnId, fluigId] of Object.entries(conv.idToFluig)) {
                    expect(conv.fluigToId[fluigId]).toBe(bpmnId);
                }
            });

            it('mapeia todas as atividades, transições e annotations', () => {
                const { def, conv } = load(file);
                for (const a of def.activities) { expect(conv.fluigToId[a.id]).toBeDefined(); }
                for (const t of def.transitions) { expect(conv.fluigToId[t.id]).toBeDefined(); }
                for (const an of def.annotations) { expect(conv.fluigToId[an.id]).toBeDefined(); }
            });

            it('todo sequenceFlow referencia ids existentes', () => {
                const { conv } = load(file);
                const validIds = new Set(Object.keys(conv.idToFluig));
                const matches = [...conv.xml.matchAll(/sourceRef="([^"]+)"|targetRef="([^"]+)"/g)];
                expect(matches.length).toBeGreaterThan(0);
                for (const m of matches) {
                    const ref = m[1] ?? m[2];
                    expect(validIds.has(ref)).toBe(true);
                }
            });
        });
    }

    it('preserva dados Fluig (mecanismo/grupo) em extensionElements', () => {
        const def = parseProcess(readFileSync(join(FIX, 'repair_shop.process'), 'utf-8'));
        const hasAssignment = def.activities.some(
            a => (a as ProcessTaskActivity).managerMechanism
        );
        const conv = convertProcessToBpmn(def);
        if (hasAssignment) {
            expect(conv.xml).toContain('<fluig:meta');
        }
    });

    it('usa bendpoints do pictograma como waypoints das arestas', () => {
        const xml = readFileSync(join(FIX, 'repair_shop.process'), 'utf-8');
        const def = parseProcess(xml);
        const emf = extractEmfDiagram(xml);
        const conv = convertProcessToBpmn(def, emf);

        // pelo menos uma aresta deve ter mais de 2 waypoints (passa por bendpoints)
        const edgeBlocks = conv.xml.match(/<bpmndi:BPMNEdge[\s\S]*?<\/bpmndi:BPMNEdge>/g) ?? [];
        const withBends = edgeBlocks.filter(
            b => (b.match(/<di:waypoint/g) ?? []).length > 2
        );
        expect(withBends.length).toBeGreaterThan(0);
    });

    it('sem EMF, arestas têm exatamente 2 waypoints (linha reta)', () => {
        const def = parseProcess(readFileSync(join(FIX, 'repair_shop.process'), 'utf-8'));
        const conv = convertProcessToBpmn(def); // sem emf
        const edgeBlocks = conv.xml.match(/<bpmndi:BPMNEdge[\s\S]*?<\/bpmndi:BPMNEdge>/g) ?? [];
        expect(edgeBlocks.length).toBeGreaterThan(0);
        for (const b of edgeBlocks) {
            expect((b.match(/<di:waypoint/g) ?? []).length).toBe(2);
        }
    });

    it('atribui flowNodeRefs às lanes por geometria', () => {
        const def = parseProcess(readFileSync(join(FIX, 'repair_shop.process'), 'utf-8'));
        if (!def.pool || def.pool.swimlanes.length === 0) { return; }
        const conv = convertProcessToBpmn(def);
        // deve haver flowNodeRefs e a maioria das atividades deve cair em alguma lane
        const refs = conv.xml.match(/<bpmn:flowNodeRef>/g) ?? [];
        expect(refs.length).toBeGreaterThan(0);
        // toda lane referenciada usa ids válidos
        const validIds = new Set(Object.keys(conv.idToFluig));
        const refIds = [...conv.xml.matchAll(/<bpmn:flowNodeRef>([^<]+)<\/bpmn:flowNodeRef>/g)].map(m => m[1]);
        for (const rid of refIds) { expect(validIds.has(rid)).toBe(true); }
    });

    it('emite cores semânticas (DI) para os nós', () => {
        const def = parseProcess(readFileSync(join(FIX, 'simple.process'), 'utf-8'));
        const conv = convertProcessToBpmn(def);
        // namespaces de cor declarados
        expect(conv.xml).toContain('xmlns:color=');
        expect(conv.xml).toContain('xmlns:bioc=');
        // start verde, ambos os formatos de cor presentes
        expect(conv.xml).toContain('color:background-color="#c8f7c5"');
        expect(conv.xml).toContain('bioc:fill="#c8f7c5"');
    });

    it('subprocess vira callActivity com calledElement', () => {
        const def = parseProcess(readFileSync(join(FIX, 'repair_shop.process'), 'utf-8'));
        const hasSub = def.activities.some(a => a.kind === 'subprocess');
        const conv = convertProcessToBpmn(def);
        if (hasSub) {
            expect(conv.xml).toContain('<bpmn:callActivity');
        }
    });
});
