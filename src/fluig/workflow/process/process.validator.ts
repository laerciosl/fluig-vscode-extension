import { existsSync } from 'fs';
import { dirname, join } from 'path';
import {
    ProcessActivity,
    ProcessDefinition,
    ProcessIntermediateEventActivity,
    ProcessSubProcessActivity,
    ProcessTaskActivity,
} from './process.types';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    severity: ValidationSeverity;
    code: string;
    message: string;
    /** ID da activity/transition relevante (para localizar a posição no editor). */
    targetId?: string;
}

export interface ValidationContext {
    /** Caminho absoluto do .process — usado para resolver scripts locais. */
    processFsPath: string;
}

/**
 * Conjunto puro de regras — recebe a `ProcessDefinition` parseada e retorna
 * a lista de problemas. Não toca em VS Code (testável).
 */
export function validateProcessDefinition(
    def: ProcessDefinition,
    ctx: ValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const activityIds = new Set(def.activities.map(a => a.id));
    const scriptsDir = join(dirname(ctx.processFsPath), 'scripts');

    // Regra 1 — service tasks com script ausente localmente.
    for (const task of def.activities) {
        if (task.kind !== 'service-task') {
            continue;
        }
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

    // Regra 2 — Transitions apontando para activity inexistente.
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

    // Regra 3 — Atividades sem fluxos de saída (exceto end events).
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

    // Regra 4 — Processo sem start event.
    const startEvents = def.activities.filter(a => a.kind === 'start');
    if (startEvents.length === 0) {
        issues.push({
            severity: 'error',
            code: 'no-start-event',
            message: 'Processo não tem evento de início.',
        });
    } else if (startEvents.length > 1) {
        issues.push({
            severity: 'warning',
            code: 'multiple-start-events',
            message: `Processo tem ${startEvents.length} eventos de início — em geral só deve haver 1.`,
        });
    }

    // Regra 5 — Processo sem end event.
    const endEvents = def.activities.filter(a => a.kind === 'end' || a.kind === 'end-cancel');
    if (endEvents.length === 0) {
        issues.push({
            severity: 'warning',
            code: 'no-end-event',
            message: 'Processo não tem evento de fim.',
        });
    }

    // Regra 6 — Sub-processo referenciando um .process inexistente no workspace.
    for (const activity of def.activities) {
        if (activity.kind !== 'subprocess') {
            continue;
        }
        const sub = activity as ProcessSubProcessActivity;
        if (!sub.process) {
            continue;
        }
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

    // Regra 7 — Intermediate link throw apontando para um receive inexistente.
    const linkReceives = new Set(
        def.activities
            .filter(a => a.kind === 'intermediate-link-receive')
            .map(a => a.id)
    );
    for (const activity of def.activities) {
        if (activity.kind !== 'intermediate-link-throw') {
            continue;
        }
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

    return issues;
}

function isTerminal(activity: ProcessActivity): boolean {
    return (
        activity.kind === 'end' ||
        activity.kind === 'end-cancel' ||
        activity.kind === 'intermediate-link-throw' ||
        activity.kind === 'intermediate-error'
    );
}
