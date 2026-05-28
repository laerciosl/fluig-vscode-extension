import { existsSync } from 'fs';
import { dirname, join } from 'path';
import {
    ProcessActivity,
    ProcessDefinition,
    ProcessGatewayActivity,
    ProcessIntermediateEventActivity,
    ProcessSubProcessActivity,
    ProcessTaskActivity,
} from './process.types';

const KNOWN_DIAGRAM_VERSIONS = new Set(['0.11.0', '0.10.0', '0.9.0']);

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    severity: ValidationSeverity;
    code: string;
    message: string;
    targetId?: string;
}

export interface ValidationContext {
    processFsPath: string;
}

export function validateProcessDefinition(
    def: ProcessDefinition,
    ctx: ValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const activityIds = new Set(def.activities.map(a => a.id));
    const scriptsDir = join(dirname(ctx.processFsPath), 'scripts');

    for (const task of def.activities) {
        if (task.kind !== 'service-task') { continue; }
        const t = task as ProcessTaskActivity;
        if (!t.scriptFileName) {
            issues.push({
                severity: 'warning',
                code: 'service-task-no-script',
                message: `Service task "${task.name}" não tem scriptFileName declarado.`,
                targetId: task.id,
            });
            continue;
        }
        const scriptPath = join(scriptsDir, t.scriptFileName);
        if (!existsSync(scriptPath)) {
            issues.push({
                severity: 'warning',
                code: 'script-missing',
                message: `Script ${t.scriptFileName} ausente em workflow/scripts/.`,
                targetId: task.id,
            });
        }
    }

    for (const t of def.transitions) {
        if (t.sourceRef && !activityIds.has(t.sourceRef)) {
            issues.push({
                severity: 'error',
                code: 'transition-source-missing',
                message: `Flow ${t.id}: sourceRef "${t.sourceRef}" não existe.`,
                targetId: t.id,
            });
        }
        if (t.targetRef && !activityIds.has(t.targetRef)) {
            issues.push({
                severity: 'error',
                code: 'transition-target-missing',
                message: `Flow ${t.id}: targetRef "${t.targetRef}" não existe.`,
                targetId: t.id,
            });
        }
    }

    for (const activity of def.activities) {
        if (activity.outgoing.length === 0 && !isTerminal(activity)) {
            issues.push({
                severity: 'warning',
                code: 'activity-no-outgoing',
                message: `"${activity.name || activity.id}" não tem fluxos de saída.`,
                targetId: activity.id,
            });
        }
    }

    const startEvents = def.activities.filter(a => a.kind === 'start');
    if (startEvents.length === 0) {
        issues.push({ severity: 'error', code: 'no-start-event', message: 'Processo não tem evento de início.' });
    } else if (startEvents.length > 1) {
        issues.push({
            severity: 'warning',
            code: 'multiple-start-events',
            message: `Processo tem ${startEvents.length} eventos de início — em geral só deve haver 1.`,
        });
    }

    const endEvents = def.activities.filter(a => a.kind === 'end' || a.kind === 'end-cancel');
    if (endEvents.length === 0) {
        issues.push({ severity: 'warning', code: 'no-end-event', message: 'Processo não tem evento de fim.' });
    }

    for (const activity of def.activities) {
        if (activity.kind !== 'subprocess') { continue; }
        const sub = activity as ProcessSubProcessActivity;
        if (!sub.process) { continue; }
        const subPath = join(dirname(ctx.processFsPath), `${sub.process}.process`);
        if (!existsSync(subPath)) {
            issues.push({
                severity: 'info',
                code: 'subprocess-file-missing',
                message: `Sub-processo "${sub.process}.process" não encontrado no workspace.`,
                targetId: activity.id,
            });
        }
    }

    const linkReceives = new Set(
        def.activities
            .filter(a => a.kind === 'intermediate-link-receive')
            .map(a => a.id)
    );
    for (const activity of def.activities) {
        if (activity.kind !== 'intermediate-link-throw') { continue; }
        const ev = activity as ProcessIntermediateEventActivity;
        if (ev.linkId && !linkReceives.has(ev.linkId)) {
            issues.push({
                severity: 'error',
                code: 'link-target-missing',
                message: `Link throw "${activity.name || activity.id}" aponta para "${ev.linkId}" mas não existe link receive correspondente.`,
                targetId: activity.id,
            });
        }
    }

    const dv = def.metadata.diagramVersion;
    if (dv && !KNOWN_DIAGRAM_VERSIONS.has(dv)) {
        issues.push({
            severity: 'info',
            code: 'unknown-diagram-version',
            message: `Versão do diagrama EMF "${dv}" não foi validada com esta extensão. Resultado pode variar.`,
        });
    }

    const deadEnds = findDeadEnds(def);
    for (const id of deadEnds) {
        const activity = def.activities.find(a => a.id === id);
        issues.push({
            severity: 'warning',
            code: 'dead-end',
            message: `"${activity?.name || id}" não tem caminho para nenhum evento de fim.`,
            targetId: id,
        });
    }

    if (def.metadata.cardIndex) {
        const formExists = checkFormExists(ctx.processFsPath, def.metadata.cardIndex);
        if (!formExists) {
            issues.push({
                severity: 'info',
                code: 'form-missing',
                message: `Formulário "${def.metadata.cardIndex}" não encontrado no workspace (procurado em forms/${def.metadata.cardIndex}/ e ${def.metadata.cardIndex}.form).`,
            });
        }
    }

    const cycleNodeIds = detectCycles(def);
    for (const id of cycleNodeIds) {
        const activity = def.activities.find(a => a.id === id);
        issues.push({
            severity: 'info',
            code: 'cycle-detected',
            message: `Loop detectado: "${activity?.name || id}" participa de um ciclo no fluxo — verifique se é intencional.`,
            targetId: id,
        });
    }

    for (const activity of def.activities) {
        if (activity.kind !== 'gateway-exclusive') { continue; }
        const gw = activity as ProcessGatewayActivity;
        const seen = new Set<string>();
        for (const cond of gw.conditions) {
            for (const dsId of extractDatasetRefs(cond.expression)) {
                if (seen.has(dsId)) { continue; }
                seen.add(dsId);
                if (!datasetExists(ctx.processFsPath, dsId)) {
                    issues.push({
                        severity: 'info',
                        code: 'dataset-missing',
                        message: `Dataset "${dsId}" referenciado em condição do gateway "${activity.name || activity.id}" não encontrado no workspace.`,
                        targetId: activity.id,
                    });
                }
            }
        }
    }

    return issues;
}

function findDeadEnds(def: ProcessDefinition): string[] {
    if (def.activities.length === 0) { return []; }
    const endIds = new Set(
        def.activities.filter(a => a.kind === 'end' || a.kind === 'end-cancel').map(a => a.id)
    );
    if (endIds.size === 0) { return []; }
    const reverse = new Map<string, string[]>();
    for (const a of def.activities) { reverse.set(a.id, []); }
    for (const t of def.transitions) {
        if (t.targetRef && t.sourceRef && reverse.has(t.targetRef)) {
            reverse.get(t.targetRef)!.push(t.sourceRef);
        }
    }
    const reachable = new Set<string>(endIds);
    const queue = [...endIds];
    while (queue.length > 0) {
        const node = queue.shift()!;
        for (const pred of reverse.get(node) ?? []) {
            if (!reachable.has(pred)) {
                reachable.add(pred);
                queue.push(pred);
            }
        }
    }
    return def.activities
        .filter(a => !reachable.has(a.id) && !isTerminal(a))
        .map(a => a.id);
}

function checkFormExists(processFsPath: string, cardIndex: string): boolean {
    let dir = dirname(processFsPath);
    for (let i = 0; i < 5; i++) {
        if (
            existsSync(join(dir, 'forms', cardIndex)) ||
            existsSync(join(dir, `${cardIndex}.form`)) ||
            existsSync(join(dir, 'forms', `${cardIndex}.form`))
        ) {
            return true;
        }
        const parent = dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return false;
}

function isTerminal(activity: ProcessActivity): boolean {
    return (
        activity.kind === 'end' ||
        activity.kind === 'end-cancel' ||
        activity.kind === 'intermediate-link-throw' ||
        activity.kind === 'intermediate-error'
    );
}

function detectCycles(def: ProcessDefinition): string[] {
    const adj = new Map<string, string[]>();
    for (const a of def.activities) { adj.set(a.id, []); }
    for (const t of def.transitions) {
        if (t.sourceRef && t.targetRef && adj.has(t.sourceRef)) {
            adj.get(t.sourceRef)!.push(t.targetRef);
        }
    }
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const cycleNodes = new Set<string>();
    function dfs(nodeId: string): void {
        if (inStack.has(nodeId)) { cycleNodes.add(nodeId); return; }
        if (visited.has(nodeId)) { return; }
        visited.add(nodeId);
        inStack.add(nodeId);
        for (const next of adj.get(nodeId) ?? []) { dfs(next); }
        inStack.delete(nodeId);
    }
    for (const a of def.activities) { dfs(a.id); }
    return [...cycleNodes];
}

function extractDatasetRefs(expression: string): string[] {
    if (!expression) { return []; }
    const refs: string[] = [];
    const re = /(?:DatasetFactory\.getDataset|hAPI\.getDatasetValues)\s*\(\s*["']([^"']+)["']/g;
    for (const match of expression.matchAll(re)) { refs.push(match[1]); }
    return refs;
}

function datasetExists(processFsPath: string, datasetId: string): boolean {
    let dir = dirname(processFsPath);
    for (let i = 0; i < 5; i++) {
        if (
            existsSync(join(dir, 'datasets', `${datasetId}.js`)) ||
            existsSync(join(dir, 'datasets', datasetId)) ||
            existsSync(join(dir, 'datasets', `${datasetId}.dataset`))
        ) {
            return true;
        }
        const parent = dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return false;
}
