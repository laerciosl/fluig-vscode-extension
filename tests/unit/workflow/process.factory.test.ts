import { describe, it, expect } from 'vitest';
import { createMinimalProcess, createMinimalProcessXml } from '../../../src/fluig/workflow/process/process.factory';
import { parseProcess } from '../../../src/fluig/workflow/process/process.parser';

describe('createMinimalProcess', () => {
    it('retorna ProcessDefinition com metadata correta', () => {
        const { def } = createMinimalProcess({ id: 'myproc', name: 'Meu Processo' });
        expect(def.metadata.id).toBe('myproc');
        expect(def.metadata.name).toBe('Meu Processo');
        expect(def.metadata.version).toBe('1');
    });

    it('gera pool e swimlane com ids baseados no id do processo', () => {
        const { def } = createMinimalProcess({ id: 'teste', name: 'Teste' });
        expect(def.pool?.id).toBe('teste_pool');
        expect(def.pool?.swimlanes).toHaveLength(1);
        expect(def.pool?.swimlanes[0].id).toBe('teste_lane');
    });

    it('usa o swimlaneName informado', () => {
        const { def } = createMinimalProcess({ id: 'p', name: 'P', swimlaneName: 'Aprovação' });
        expect(def.pool?.swimlanes[0].name).toBe('Aprovação');
    });

    it('usa "Geral" como swimlane padrão', () => {
        const { def } = createMinimalProcess({ id: 'p', name: 'P' });
        expect(def.pool?.swimlanes[0].name).toBe('Geral');
    });

    it('gera start → task → end', () => {
        const { def } = createMinimalProcess({ id: 'p', name: 'P' });
        expect(def.activities).toHaveLength(3);
        expect(def.activities.find(a => a.kind === 'start')).toBeDefined();
        expect(def.activities.find(a => a.kind === 'task')).toBeDefined();
        expect(def.activities.find(a => a.kind === 'end')).toBeDefined();
    });

    it('ids das atividades usam o id do processo como prefixo', () => {
        const { def } = createMinimalProcess({ id: 'meu', name: 'M' });
        const ids = def.activities.map(a => a.id);
        expect(ids).toContain('meu_start');
        expect(ids).toContain('meu_task');
        expect(ids).toContain('meu_end');
    });

    it('gera 2 transitions (start→task, task→end)', () => {
        const { def } = createMinimalProcess({ id: 'p', name: 'P' });
        expect(def.transitions).toHaveLength(2);
        const t1 = def.transitions.find(t => t.sourceRef === 'p_start');
        const t2 = def.transitions.find(t => t.sourceRef === 'p_task');
        expect(t1?.targetRef).toBe('p_task');
        expect(t2?.targetRef).toBe('p_end');
    });

    it('gera EmfDiagram com pool + 3 shapes + 2 connections', () => {
        const { emf } = createMinimalProcess({ id: 'p', name: 'P' });
        expect(emf.pool.businessId).toBe('p_pool');
        expect(emf.shapes).toHaveLength(3);
        expect(emf.connections).toHaveLength(2);
    });

    it('shapes têm childIndexes 1, 2, 3', () => {
        const { emf } = createMinimalProcess({ id: 'p', name: 'P' });
        const indexes = emf.shapes.map(s => s.childIndex).sort();
        expect(indexes).toEqual([1, 2, 3]);
    });

    it('connections têm connectionIndexes 0 e 1', () => {
        const { emf } = createMinimalProcess({ id: 'p', name: 'P' });
        const indexes = emf.connections.map(c => c.connectionIndex).sort((a, b) => a - b);
        expect(indexes).toEqual([0, 1]);
    });

    it('round-trip semântico: serializar e parsear retorna o mesmo def', () => {
        const { def, emf } = createMinimalProcess({ id: 'rt', name: 'Round Trip', swimlaneName: 'Fila' });
        const xml = createMinimalProcessXml({ id: 'rt', name: 'Round Trip', swimlaneName: 'Fila' });
        const def2 = parseProcess(xml);

        expect(def2.metadata.id).toBe(def.metadata.id);
        expect(def2.metadata.name).toBe(def.metadata.name);
        expect(def2.activities).toHaveLength(def.activities.length);
        expect(def2.transitions).toHaveLength(def.transitions.length);
        expect(def2.pool?.swimlanes[0].name).toBe('Fila');

        for (const a of def.activities) {
            const a2 = def2.activities.find(x => x.id === a.id);
            expect(a2?.kind, `kind de ${a.id}`).toBe(a.kind);
            expect(a2?.name, `nome de ${a.id}`).toBe(a.name);
        }
    });

    it('createMinimalProcessXml gera XML com tags xmi:XMI e pi:Diagram', () => {
        const xml = createMinimalProcessXml({ id: 'x', name: 'X' });
        expect(xml).toContain('<xmi:XMI');
        expect(xml).toContain('<pi:Diagram');
        expect(xml).toContain('bpmn2:BpmnProcess');
        expect(xml).toContain('bpmn2:BpmnTask');
        expect(xml).toContain('bpmn2:SequenceFlow');
    });
});
