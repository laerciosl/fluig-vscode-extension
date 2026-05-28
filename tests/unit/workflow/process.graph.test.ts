import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { parseProcess } from '../../../src/fluig/workflow/process/process.parser';
import { extractEmfDiagram } from '../../../src/fluig/workflow/process/process.emf-parser';
import { ProcessGraph, serializeAssignmentXml, serializeConditionsXml } from '../../../src/fluig/workflow/process/process.graph';
import type { ProcessTaskActivity, ProcessGatewayActivity } from '../../../src/fluig/workflow/process/process.types';

function loadFixture(name: string): string {
    return readFileSync(join(__dirname, '../../fixtures/process', name), 'utf-8');
}

function makeGraph(fixtureName: string): ProcessGraph {
    const xml = loadFixture(fixtureName);
    return ProcessGraph.from(parseProcess(xml), extractEmfDiagram(xml));
}

// ── addNode ───────────────────────────────────────────────────────────────

describe('ProcessGraph — addNode', () => {
    it('adiciona um task: id gerado, aparece nas activities', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('task', 'Nova Tarefa');
        expect(g.def.activities.find(a => a.id === id)).toBeDefined();
        expect(g.def.activities.find(a => a.id === id)?.name).toBe('Nova Tarefa');
        expect(g.def.activities.find(a => a.id === id)?.kind).toBe('task');
    });

    it('adiciona um gateway', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('gateway-exclusive', 'Aprovado?');
        expect(g.def.activities.find(a => a.id === id)?.kind).toBe('gateway-exclusive');
    });

    it('adiciona um start event', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('start', 'Início 2');
        expect(g.def.activities.find(a => a.id === id)?.kind).toBe('start');
    });

    it('adiciona um service-task', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('service-task', 'Serviço', { scriptFileName: 'svc.js' });
        const act = g.def.activities.find(a => a.id === id) as any;
        expect(act?.kind).toBe('service-task');
        expect(act?.scriptFileName).toBe('svc.js');
    });

    it('não duplica ids ao adicionar múltiplos nós', () => {
        const g = makeGraph('simple.process');
        const id1 = g.addNode('task', 'A');
        const id2 = g.addNode('task', 'B');
        const id3 = g.addNode('task', 'C');
        expect(new Set([id1, id2, id3]).size).toBe(3);
    });

    it('childIndex é maior que todos os existentes', () => {
        const g = makeGraph('simple.process');
        const maxBefore = Math.max(...g.emf.shapes.map(s => s.childIndex));
        g.addNode('task', 'X');
        const newShape = g.emf.shapes.at(-1)!;
        expect(newShape.childIndex).toBeGreaterThan(maxBefore);
    });

    it('rawXml contém o businessId', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('task', 'Teste');
        const shape = g.emf.shapes.find(s => s.businessId === id)!;
        expect(shape.rawXml).toContain(`businessObjects="${id}"`);
    });

    it('round-trip: nó adicionado aparece no parseProcess', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('task', 'Persistida');
        const xml2 = g.serialize();
        const def2 = parseProcess(xml2);
        expect(def2.activities.find(a => a.id === id)).toBeDefined();
        expect(def2.activities.find(a => a.id === id)?.name).toBe('Persistida');
    });

    it('adiciona nó com posição explícita: coordenadas preservadas no rawXml', () => {
        const g = makeGraph('simple.process');
        g.addNode('task', 'Posicionada', { x: 500, y: 200 });
        const shape = g.emf.shapes.at(-1)!;
        expect(shape.rawXml).toContain('x="500"');
        expect(shape.rawXml).toContain('y="200"');
    });
});

// ── removeNode ────────────────────────────────────────────────────────────

describe('ProcessGraph — removeNode', () => {
    it('remove o nó do def e emf', () => {
        const g = makeGraph('simple.process');
        const countBefore = g.def.activities.length;
        g.removeNode('task1');
        expect(g.def.activities.find(a => a.id === 'task1')).toBeUndefined();
        expect(g.emf.shapes.find(s => s.businessId === 'task1')).toBeUndefined();
        expect(g.def.activities.length).toBe(countBefore - 1);
    });

    it('remove as transitions conectadas ao nó', () => {
        const g = makeGraph('simple.process');
        g.removeNode('task1');
        expect(g.def.transitions.find(t => t.sourceRef === 'task1')).toBeUndefined();
        expect(g.def.transitions.find(t => t.targetRef === 'task1')).toBeUndefined();
        expect(g.emf.connections.find(c => c.sourceBusinessId === 'task1')).toBeUndefined();
        expect(g.emf.connections.find(c => c.targetBusinessId === 'task1')).toBeUndefined();
    });

    it('round-trip: nó removido não aparece no parseProcess', () => {
        const g = makeGraph('simple.process');
        g.removeNode('task1');
        const def2 = parseProcess(g.serialize());
        expect(def2.activities.find(a => a.id === 'task1')).toBeUndefined();
    });

    it('removeNode em id inexistente não lança exceção', () => {
        const g = makeGraph('simple.process');
        expect(() => g.removeNode('nao_existe')).not.toThrow();
    });
});

// ── connect / disconnect ──────────────────────────────────────────────────

describe('ProcessGraph — connect / disconnect', () => {
    it('connect cria transition com sourceRef/targetRef corretos', () => {
        const g = makeGraph('simple.process');
        const flowId = g.connect('start1', 'end1', 'Atalho');
        const t = g.def.transitions.find(t => t.id === flowId);
        expect(t).toBeDefined();
        expect(t!.sourceRef).toBe('start1');
        expect(t!.targetRef).toBe('end1');
        expect(t!.name).toBe('Atalho');
    });

    it('connect atualiza outgoing/incoming das activities', () => {
        const g = makeGraph('simple.process');
        const taskId = g.addNode('task', 'Extra');
        const flowId = g.connect('start1', taskId);
        expect(g.def.activities.find(a => a.id === 'start1')?.outgoing).toContain(flowId);
        expect(g.def.activities.find(a => a.id === taskId)?.incoming).toContain(flowId);
    });

    it('disconnect remove transition e atualiza incoming/outgoing', () => {
        const g = makeGraph('simple.process');
        const flowId = g.connect('start1', 'end1');
        g.disconnect(flowId);
        expect(g.def.transitions.find(t => t.id === flowId)).toBeUndefined();
        expect(g.def.activities.find(a => a.id === 'start1')?.outgoing).not.toContain(flowId);
        expect(g.def.activities.find(a => a.id === 'end1')?.incoming).not.toContain(flowId);
    });

    it('round-trip: nova transição aparece com sourceRef/targetRef corretos', () => {
        const g = makeGraph('simple.process');
        const newId = g.addNode('task', 'Intermediária', { x: 230, y: 95 });
        const flow1 = g.connect('start1', newId);
        const flow2 = g.connect(newId, 'end1');
        const def2 = parseProcess(g.serialize());
        const t1 = def2.transitions.find(t => t.id === flow1);
        const t2 = def2.transitions.find(t => t.id === flow2);
        expect(t1?.sourceRef).toBe('start1');
        expect(t1?.targetRef).toBe(newId);
        expect(t2?.sourceRef).toBe(newId);
        expect(t2?.targetRef).toBe('end1');
    });

    it('connection refs start/end apontam para os childIndexes corretos', () => {
        const g = makeGraph('simple.process');
        const taskId = g.addNode('task', 'T');
        const taskChildIndex = g.emf.shapes.find(s => s.businessId === taskId)!.childIndex;
        g.connect('start1', taskId);
        const startChildIndex = g.emf.shapes.find(s => s.businessId === 'start1')!.childIndex;
        const xml2 = g.serialize();
        expect(xml2).toContain(`start="/0/@children.${startChildIndex}/@anchors.0"`);
        expect(xml2).toContain(`end="/0/@children.${taskChildIndex}/@anchors.0"`);
    });
});

// ── moveNode / renameNode ─────────────────────────────────────────────────

describe('ProcessGraph — moveNode / renameNode', () => {
    it('moveNode atualiza x/y no rawXml do shape', () => {
        const g = makeGraph('simple.process');
        g.moveNode('task1', 300, 150);
        const shape = g.emf.shapes.find(s => s.businessId === 'task1')!;
        expect(shape.rawXml).toContain('x="300"');
        expect(shape.rawXml).toContain('y="150"');
    });

    it('moveNode em id inexistente não lança exceção', () => {
        const g = makeGraph('simple.process');
        expect(() => g.moveNode('nao_existe', 0, 0)).not.toThrow();
    });

    it('renameNode atualiza name na activity', () => {
        const g = makeGraph('simple.process');
        g.renameNode('task1', 'Novo Nome');
        expect(g.def.activities.find(a => a.id === 'task1')?.name).toBe('Novo Nome');
    });

    it('renameNode atualiza value no MultiText do rawXml', () => {
        const g = makeGraph('simple.process');
        g.renameNode('task1', 'Novo Texto');
        const shape = g.emf.shapes.find(s => s.businessId === 'task1')!;
        expect(shape.rawXml).toContain('value="Novo Texto"');
    });

    it('round-trip: nome renomeado aparece no parseProcess', () => {
        const g = makeGraph('simple.process');
        g.renameNode('task1', 'Renomeado');
        const def2 = parseProcess(g.serialize());
        expect(def2.activities.find(a => a.id === 'task1')?.name).toBe('Renomeado');
    });
});

// ── Round-trip completo ───────────────────────────────────────────────────

describe('ProcessGraph — round-trip completo', () => {
    it('add task + connect + serialize + parse = expected state', () => {
        const g = makeGraph('simple.process');
        const id = g.addNode('task', 'Aprovação Extra', { x: 240, y: 90 });
        const f1 = g.connect('start1', id);
        const f2 = g.connect(id, 'end1');

        const def2 = parseProcess(g.serialize());
        expect(def2.activities.find(a => a.id === id)?.name).toBe('Aprovação Extra');
        expect(def2.transitions.find(t => t.id === f1)?.sourceRef).toBe('start1');
        expect(def2.transitions.find(t => t.id === f2)?.targetRef).toBe('end1');
    });

    it('remove task + serialize + parse = task e transitions ausentes', () => {
        const g = makeGraph('simple.process');
        g.removeNode('task1');
        const def2 = parseProcess(g.serialize());
        expect(def2.activities.find(a => a.id === 'task1')).toBeUndefined();
        expect(def2.transitions.find(t => t.sourceRef === 'task1')).toBeUndefined();
        expect(def2.transitions.find(t => t.targetRef === 'task1')).toBeUndefined();
    });

    it('repair_shop: addNode preserva todos os nós existentes', () => {
        const g = makeGraph('repair_shop.process');
        const countBefore = g.def.activities.length;
        g.addNode('task', 'Extra');
        const def2 = parseProcess(g.serialize());
        expect(def2.activities.length).toBe(countBefore + 1);
    });

    it('repair_shop: removeNode de leaf não quebra o processo', () => {
        const g = makeGraph('repair_shop.process');
        // Pegar uma atividade com apenas uma connection (fácil de remover)
        const leaf = g.def.activities.find(a => a.outgoing.length === 0 || a.incoming.length === 0);
        if (!leaf) { return; } // Skip se não houver
        g.removeNode(leaf.id);
        const def2 = parseProcess(g.serialize());
        expect(def2.activities.find(a => a.id === leaf.id)).toBeUndefined();
    });
});

// ── updateAssignment ──────────────────────────────────────────────────────

describe('ProcessGraph — updateAssignment', () => {
    it('atualiza managerMechanism na activity', () => {
        const g = makeGraph('simple.process');
        g.updateAssignment('task1', 'Pool Grupo', undefined, 'dev_team');
        const act = g.def.activities.find(a => a.id === 'task1') as ProcessTaskActivity;
        expect(act?.managerMechanism).toBe('Pool Grupo');
    });

    it('gera rawAssignmentXml com classe XStream correta para Papel', () => {
        const g = makeGraph('simple.process');
        g.updateAssignment('task1', 'Papel', 'rh_manager');
        const act = g.def.activities.find(a => a.id === 'task1') as ProcessTaskActivity;
        expect(act?.rawAssignmentXml).toContain('AssignmentControllerRole');
        expect(act?.rawAssignmentXml).toContain('<roleId>rh_manager</roleId>');
    });

    it('gera rawAssignmentXml com classe Pool Grupo', () => {
        const g = makeGraph('simple.process');
        g.updateAssignment('task1', 'Pool Grupo', undefined, 'logistica');
        const act = g.def.activities.find(a => a.id === 'task1') as ProcessTaskActivity;
        expect(act?.rawAssignmentXml).toContain('AssignmentControllerPoolGroup');
        expect(act?.rawAssignmentXml).toContain('<groupId>logistica</groupId>');
    });

    it('round-trip: assignment preservado após serializar', () => {
        const g = makeGraph('simple.process');
        g.updateAssignment('task1', 'Pool Papel', 'rps_inspection');
        const def2 = parseProcess(g.serialize());
        const act2 = def2.activities.find(a => a.id === 'task1') as ProcessTaskActivity;
        expect(act2?.managerMechanism).toBe('Pool Papel');
        expect(act2?.assignment?.roleId).toBe('rps_inspection');
    });

    it('ignora se o id não é uma task', () => {
        const g = makeGraph('simple.process');
        expect(() => g.updateAssignment('start1', 'Papel')).not.toThrow();
        const act = g.def.activities.find(a => a.id === 'start1') as any;
        expect(act?.managerMechanism).toBeUndefined();
    });
});

// ── updateGatewayConditions ───────────────────────────────────────────────

describe('ProcessGraph — updateGatewayConditions', () => {
    it('atualiza conditions na activity do gateway', () => {
        const g = makeGraph('repair_shop.process');
        const gwId = g.def.activities.find(a => a.kind === 'gateway-exclusive')?.id;
        if (!gwId) { return; }
        g.updateGatewayConditions(gwId, [
            { expression: 'hAPI.getCardValue("x") == "y"', targetTaskId: 'task1' },
        ]);
        const gw = g.def.activities.find(a => a.id === gwId) as ProcessGatewayActivity;
        expect(gw.conditions).toHaveLength(1);
        expect(gw.conditions[0].expression).toBe('hAPI.getCardValue("x") == "y"');
        expect(gw.conditions[0].targetTaskId).toBe('task1');
    });

    it('rawConditionXml tem estrutura XStream com lista', () => {
        const g = makeGraph('repair_shop.process');
        const gwId = g.def.activities.find(a => a.kind === 'gateway-exclusive')!.id;
        g.updateGatewayConditions(gwId, [
            { expression: 'x == 1', targetTaskId: 'task9' },
            { expression: 'x == 2', targetTaskId: 'task10' },
        ]);
        const gw = g.def.activities.find(a => a.id === gwId) as ProcessGatewayActivity;
        expect(gw.rawConditionXml).toContain('<list>');
        expect(gw.rawConditionXml).toContain('ConditionImpl');
        expect(gw.rawConditionXml).toContain('<order>1</order>');
        expect(gw.rawConditionXml).toContain('<order>2</order>');
        expect(gw.rawConditionXml).toContain('<targetTask>task9</targetTask>');
    });

    it('round-trip: condições preservadas com expressão JavaScript', () => {
        const g = makeGraph('repair_shop.process');
        const gwId = g.def.activities.find(a => a.kind === 'gateway-exclusive')!.id;
        g.updateGatewayConditions(gwId, [
            { expression: 'hAPI.getCardValue("status") == "ok"', targetTaskId: 'task9' },
        ]);
        const def2 = parseProcess(g.serialize());
        const gw2 = def2.activities.find(a => a.id === gwId) as ProcessGatewayActivity;
        expect(gw2.conditions[0].expression).toBe('hAPI.getCardValue("status") == "ok"');
        expect(gw2.conditions[0].targetTaskId).toBe('task9');
    });
});

// ── updateSla ─────────────────────────────────────────────────────────────

describe('ProcessGraph — updateSla', () => {
    it('atualiza extraAttributes.expediente', () => {
        const g = makeGraph('simple.process');
        g.updateSla('task1', 'Default');
        expect(g.def.activities.find(a => a.id === 'task1')?.extraAttributes?.expediente).toBe('Default');
    });

    it('round-trip: SLA preservado após serializar', () => {
        const g = makeGraph('simple.process');
        g.updateSla('task1', '24h');
        const def2 = parseProcess(g.serialize());
        const act = def2.activities.find(a => a.id === 'task1');
        expect(act?.extraAttributes?.expediente).toBe('24h');
    });
});

// ── serializeAssignmentXml / serializeConditionsXml ───────────────────────

describe('serializeAssignmentXml', () => {
    it('gera XML com classe Pool Papel e roleId', () => {
        const xml = serializeAssignmentXml('Pool Papel', 'rh_role');
        expect(xml).toContain('AssignmentControllerPoolRole');
        expect(xml).toContain('<roleId>rh_role</roleId>');
        expect(xml).toContain('<mechanismName>Pool Papel</mechanismName>');
    });

    it('gera XML com classe Pool Grupo e groupId', () => {
        const xml = serializeAssignmentXml('Pool Grupo', undefined, 'dev');
        expect(xml).toContain('AssignmentControllerPoolGroup');
        expect(xml).toContain('<groupId>dev</groupId>');
    });
});

describe('serializeConditionsXml', () => {
    it('gera lista vazia para condições vazias', () => {
        expect(serializeConditionsXml([])).toBe('<list/>');
    });

    it('gera XML com todas as condições', () => {
        const xml = serializeConditionsXml([
            { expression: 'x == 1', targetTaskId: 'task1' },
            { expression: 'x == 2', targetTaskId: 'task2' },
        ]);
        expect(xml).toContain('<list>');
        expect(xml).toContain('<order>1</order>');
        expect(xml).toContain('<order>2</order>');
        expect(xml).toContain('<targetTask>task1</targetTask>');
    });

    it('encodifica aspas duplas como &quot; nas expressões', () => {
        const xml = serializeConditionsXml([
            { expression: 'hAPI.getCardValue("x") == "y"', targetTaskId: 't' },
        ]);
        expect(xml).toContain('&quot;x&quot;');
        expect(xml).not.toContain('"x"');
    });
});
