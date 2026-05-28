import { describe, it, expect } from 'vitest';
import { diffProcess, describeChange } from '../../../src/fluig/workflow/process/process.diff';
import { ProcessDefinition } from '../../../src/fluig/workflow/process/process.types';

function makeDef(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
    return {
        metadata: { id: 'p1', name: 'Process 1', version: '1' },
        activities: [],
        transitions: [],
        annotations: [],
        ...overrides,
    };
}

describe('diffProcess', () => {
    it('returns no changes when definitions are equivalent', () => {
        const a = makeDef();
        const b = makeDef();
        const diff = diffProcess(a, b);
        expect(diff.changes).toEqual([]);
        expect(diff.sameProcess).toBe(true);
    });

    it('detects metadata version change', () => {
        const a = makeDef();
        const b = makeDef({ metadata: { id: 'p1', name: 'Process 1', version: '2' } });
        const diff = diffProcess(a, b);
        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0]).toEqual({
            kind: 'metadata-changed',
            field: 'version',
            before: '1',
            after: '2',
        });
    });

    it('detects activity added', () => {
        const a = makeDef();
        const b = makeDef({
            activities: [{ id: 't1', name: 'Tarefa', kind: 'task', typeCode: 80, incoming: [], outgoing: [] }],
        });
        const diff = diffProcess(a, b);
        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0]).toMatchObject({ kind: 'activity-added', id: 't1', name: 'Tarefa' });
    });

    it('detects activity removed', () => {
        const a = makeDef({
            activities: [{ id: 't1', name: 'Tarefa', kind: 'task', typeCode: 80, incoming: [], outgoing: [] }],
        });
        const b = makeDef();
        const diff = diffProcess(a, b);
        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0]).toMatchObject({ kind: 'activity-removed', id: 't1' });
    });

    it('detects activity renamed (same id)', () => {
        const a = makeDef({
            activities: [{ id: 't1', name: 'Velha', kind: 'task', typeCode: 80, incoming: [], outgoing: [] }],
        });
        const b = makeDef({
            activities: [{ id: 't1', name: 'Nova', kind: 'task', typeCode: 80, incoming: [], outgoing: [] }],
        });
        const diff = diffProcess(a, b);
        expect(diff.changes).toEqual([
            { kind: 'activity-renamed', id: 't1', before: 'Velha', after: 'Nova' },
        ]);
    });

    it('detects script change in service-task', () => {
        const a = makeDef({
            activities: [{ id: 's1', name: 'Service', kind: 'service-task', typeCode: 82, incoming: [], outgoing: [], scriptFileName: 'old.js' } as any],
        });
        const b = makeDef({
            activities: [{ id: 's1', name: 'Service', kind: 'service-task', typeCode: 82, incoming: [], outgoing: [], scriptFileName: 'new.js' } as any],
        });
        const diff = diffProcess(a, b);
        expect(diff.changes).toEqual([
            { kind: 'activity-script-changed', id: 's1', name: 'Service', before: 'old.js', after: 'new.js' },
        ]);
    });

    it('detects assignment change on task', () => {
        const a = makeDef({
            activities: [{ id: 't1', name: 'T', kind: 'task', typeCode: 80, incoming: [], outgoing: [], managerMechanism: 'Pool Papel', assignment: { mechanism: 'Pool Papel', roleId: 'admin' } } as any],
        });
        const b = makeDef({
            activities: [{ id: 't1', name: 'T', kind: 'task', typeCode: 80, incoming: [], outgoing: [], managerMechanism: 'Pool Grupo', assignment: { mechanism: 'Pool Grupo', groupId: 'csv' } } as any],
        });
        const diff = diffProcess(a, b);
        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].kind).toBe('activity-assignment-changed');
    });

    it('detects transition rerouted', () => {
        const a = makeDef({
            transitions: [{ id: 'f1', name: '', sourceRef: 'a', targetRef: 'b' }],
        });
        const b = makeDef({
            transitions: [{ id: 'f1', name: '', sourceRef: 'a', targetRef: 'c' }],
        });
        const diff = diffProcess(a, b);
        expect(diff.changes[0]).toMatchObject({
            kind: 'transition-rerouted',
            id: 'f1',
            after: { source: 'a', target: 'c' },
        });
    });

    it('detects transition added and removed', () => {
        const a = makeDef({
            transitions: [{ id: 'f1', name: '', sourceRef: 'a', targetRef: 'b' }],
        });
        const b = makeDef({
            transitions: [{ id: 'f2', name: '', sourceRef: 'a', targetRef: 'c' }],
        });
        const diff = diffProcess(a, b);
        const kinds = diff.changes.map(c => c.kind).sort();
        expect(kinds).toEqual(['transition-added', 'transition-removed']);
    });

    it('describeChange produces readable strings', () => {
        const desc = describeChange({
            kind: 'activity-added',
            id: 't1',
            name: 'Tarefa',
            activityKind: 'task',
        });
        expect(desc).toContain('Tarefa');
        expect(desc).toContain('t1');
    });

    it('marks sameProcess=false when id differs', () => {
        const a = makeDef({ metadata: { id: 'p1', name: 'A', version: '1' } });
        const b = makeDef({ metadata: { id: 'p2', name: 'B', version: '1' } });
        expect(diffProcess(a, b).sameProcess).toBe(false);
    });
});
