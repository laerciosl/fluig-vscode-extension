import {
    ProcessActivity,
    ProcessDefinition,
    ProcessGatewayActivity,
    ProcessSubProcessActivity,
    ProcessTaskActivity,
    ProcessTransition,
} from './process.types';

/**
 * Mudanças semânticas entre duas versões de um `.process`.
 *
 * Em vez de mostrar diff bruto de XML (que polui com coordenadas, styles e
 * order de XStream), comparamos as estruturas parseadas e produzimos uma
 * lista de mudanças classificadas.
 */
export type ProcessChange =
    | { kind: 'metadata-changed'; field: string; before: string; after: string }
    | { kind: 'activity-added'; id: string; name: string; activityKind: string }
    | { kind: 'activity-removed'; id: string; name: string; activityKind: string }
    | { kind: 'activity-renamed'; id: string; before: string; after: string }
    | { kind: 'activity-kind-changed'; id: string; name: string; before: string; after: string }
    | { kind: 'activity-script-changed'; id: string; name: string; before?: string; after?: string }
    | { kind: 'activity-assignment-changed'; id: string; name: string; before: string; after: string }
    | { kind: 'activity-gateway-conditions-changed'; id: string; name: string; before: string[]; after: string[] }
    | { kind: 'transition-added'; id: string; sourceRef: string; targetRef: string; label: string }
    | { kind: 'transition-removed'; id: string; sourceRef: string; targetRef: string; label: string }
    | { kind: 'transition-rerouted'; id: string; before: { source: string; target: string }; after: { source: string; target: string } }
    | { kind: 'transition-relabeled'; id: string; before: string; after: string };

export interface ProcessDiff {
    sameProcess: boolean;
    changes: ProcessChange[];
}

export function diffProcess(before: ProcessDefinition, after: ProcessDefinition): ProcessDiff {
    const changes: ProcessChange[] = [];

    diffMetadata(before, after, changes);
    diffActivities(before, after, changes);
    diffTransitions(before, after, changes);

    return {
        sameProcess: before.metadata.id === after.metadata.id,
        changes,
    };
}

// ── Metadata ──────────────────────────────────────────────────────────────

function diffMetadata(
    before: ProcessDefinition,
    after: ProcessDefinition,
    changes: ProcessChange[]
): void {
    const fields: (keyof ProcessDefinition['metadata'])[] = [
        'name', 'version', 'category', 'cardIndex',
        'serverId', 'volume', 'expedient', 'managerMechanism', 'author',
    ];
    for (const field of fields) {
        const a = String(before.metadata[field] ?? '');
        const b = String(after.metadata[field] ?? '');
        if (a !== b) {
            changes.push({ kind: 'metadata-changed', field, before: a, after: b });
        }
    }
}

// ── Activities ────────────────────────────────────────────────────────────

function diffActivities(
    before: ProcessDefinition,
    after: ProcessDefinition,
    changes: ProcessChange[]
): void {
    const beforeMap = new Map(before.activities.map(a => [a.id, a]));
    const afterMap = new Map(after.activities.map(a => [a.id, a]));

    for (const [id, b] of beforeMap) {
        const a = afterMap.get(id);
        if (!a) {
            changes.push({
                kind: 'activity-removed',
                id,
                name: b.name,
                activityKind: b.kind,
            });
        }
    }
    for (const [id, a] of afterMap) {
        const b = beforeMap.get(id);
        if (!b) {
            changes.push({
                kind: 'activity-added',
                id,
                name: a.name,
                activityKind: a.kind,
            });
            continue;
        }
        diffSingleActivity(b, a, changes);
    }
}

function diffSingleActivity(
    before: ProcessActivity,
    after: ProcessActivity,
    changes: ProcessChange[]
): void {
    if (before.name !== after.name) {
        changes.push({
            kind: 'activity-renamed',
            id: after.id,
            before: before.name,
            after: after.name,
        });
    }
    if (before.kind !== after.kind) {
        changes.push({
            kind: 'activity-kind-changed',
            id: after.id,
            name: after.name,
            before: before.kind,
            after: after.kind,
        });
    }
    if (before.kind === 'service-task' && after.kind === 'service-task') {
        const beforeScript = (before as ProcessTaskActivity).scriptFileName;
        const afterScript = (after as ProcessTaskActivity).scriptFileName;
        if (beforeScript !== afterScript) {
            changes.push({
                kind: 'activity-script-changed',
                id: after.id,
                name: after.name,
                before: beforeScript,
                after: afterScript,
            });
        }
    }
    if (
        (before.kind === 'task' || before.kind === 'service-task') &&
        (after.kind === 'task' || after.kind === 'service-task')
    ) {
        const beforeAssign = describeAssignment(before as ProcessTaskActivity);
        const afterAssign = describeAssignment(after as ProcessTaskActivity);
        if (beforeAssign !== afterAssign) {
            changes.push({
                kind: 'activity-assignment-changed',
                id: after.id,
                name: after.name,
                before: beforeAssign,
                after: afterAssign,
            });
        }
    }
    if (before.kind === 'gateway-exclusive' && after.kind === 'gateway-exclusive') {
        const beforeConds = (before as ProcessGatewayActivity).conditions.map(c => `${c.expression} → ${c.targetTaskId}`);
        const afterConds = (after as ProcessGatewayActivity).conditions.map(c => `${c.expression} → ${c.targetTaskId}`);
        if (!arraysEqual(beforeConds, afterConds)) {
            changes.push({
                kind: 'activity-gateway-conditions-changed',
                id: after.id,
                name: after.name,
                before: beforeConds,
                after: afterConds,
            });
        }
    }
    if (before.kind === 'subprocess' && after.kind === 'subprocess') {
        const a = before as ProcessSubProcessActivity;
        const b = after as ProcessSubProcessActivity;
        if (a.process !== b.process) {
            changes.push({
                kind: 'activity-script-changed',
                id: after.id,
                name: after.name,
                before: a.process,
                after: b.process,
            });
        }
    }
}

function describeAssignment(t: ProcessTaskActivity): string {
    if (!t.managerMechanism) {
        return '';
    }
    const parts: string[] = [t.managerMechanism];
    if (t.assignment?.roleId) {
        parts.push(`role:${t.assignment.roleId}`);
    }
    if (t.assignment?.groupId) {
        parts.push(`group:${t.assignment.groupId}`);
    }
    return parts.join(' · ');
}

// ── Transitions ───────────────────────────────────────────────────────────

function diffTransitions(
    before: ProcessDefinition,
    after: ProcessDefinition,
    changes: ProcessChange[]
): void {
    const beforeMap = new Map(before.transitions.map(t => [t.id, t]));
    const afterMap = new Map(after.transitions.map(t => [t.id, t]));

    for (const [id, b] of beforeMap) {
        if (!afterMap.has(id)) {
            changes.push({
                kind: 'transition-removed',
                id,
                sourceRef: b.sourceRef,
                targetRef: b.targetRef,
                label: b.name,
            });
        }
    }
    for (const [id, a] of afterMap) {
        const b = beforeMap.get(id);
        if (!b) {
            changes.push({
                kind: 'transition-added',
                id,
                sourceRef: a.sourceRef,
                targetRef: a.targetRef,
                label: a.name,
            });
            continue;
        }
        diffSingleTransition(b, a, changes);
    }
}

function diffSingleTransition(
    before: ProcessTransition,
    after: ProcessTransition,
    changes: ProcessChange[]
): void {
    if (before.sourceRef !== after.sourceRef || before.targetRef !== after.targetRef) {
        changes.push({
            kind: 'transition-rerouted',
            id: after.id,
            before: { source: before.sourceRef, target: before.targetRef },
            after: { source: after.sourceRef, target: after.targetRef },
        });
    }
    if (before.name !== after.name) {
        changes.push({
            kind: 'transition-relabeled',
            id: after.id,
            before: before.name,
            after: after.name,
        });
    }
}

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

// ── Human-readable summary ────────────────────────────────────────────────

export function describeChange(change: ProcessChange): string {
    switch (change.kind) {
        case 'metadata-changed':
            return `Metadata: ${change.field} "${change.before || '(vazio)'}" → "${change.after || '(vazio)'}"`;
        case 'activity-added':
            return `+ ${change.activityKind} "${change.name}" (${change.id})`;
        case 'activity-removed':
            return `− ${change.activityKind} "${change.name}" (${change.id})`;
        case 'activity-renamed':
            return `↻ "${change.before}" renomeado para "${change.after}" (${change.id})`;
        case 'activity-kind-changed':
            return `↻ Tipo de "${change.name}" mudou: ${change.before} → ${change.after}`;
        case 'activity-script-changed':
            return `↻ Script de "${change.name}": ${change.before || '(nenhum)'} → ${change.after || '(nenhum)'}`;
        case 'activity-assignment-changed':
            return `↻ Atribuição de "${change.name}": "${change.before}" → "${change.after}"`;
        case 'activity-gateway-conditions-changed':
            return `↻ Condições do gateway "${change.name}" alteradas (${change.before.length} → ${change.after.length})`;
        case 'transition-added':
            return `+ Flow ${change.id}: ${change.sourceRef} → ${change.targetRef}${change.label ? ` "${change.label}"` : ''}`;
        case 'transition-removed':
            return `− Flow ${change.id}: ${change.sourceRef} → ${change.targetRef}${change.label ? ` "${change.label}"` : ''}`;
        case 'transition-rerouted':
            return `↻ Flow ${change.id} re-roteado: ${change.before.source}→${change.before.target} ⇒ ${change.after.source}→${change.after.target}`;
        case 'transition-relabeled':
            return `↻ Flow ${change.id} relabel: "${change.before}" → "${change.after}"`;
    }
}
