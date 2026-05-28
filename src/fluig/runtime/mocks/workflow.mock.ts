export interface WorkflowContext {
    processId: string;
    processInstanceId: string;
    activityId: string;
    colleagueId: string;
    companyId: string;
    cardId: string;
    version: string;
    formId: string;
    cardFields: Record<string, string>;
    movementSequence?: number;
}

/**
 * Constrói as variáveis globais do processo injetadas no sandbox de eventos de workflow.
 * Expostas como `processId`, `getValue`, `setValue`, etc. no escopo do script.
 */
export function buildWorkflowGlobals(ctx: WorkflowContext): Record<string, any> {
    const fields = { ...ctx.cardFields };
    const changed: Record<string, string> = {};

    return {
        // ── Contexto da instância ────────────────────────────────────────────
        processId:          ctx.processId,
        processInstanceId:  ctx.processInstanceId,
        activityId:         ctx.activityId,
        activitySequenceId: ctx.activityId,
        colleagueId:        ctx.colleagueId,
        userId:             ctx.colleagueId,
        companyId:          ctx.companyId,
        cardId:             ctx.cardId,
        version:            ctx.version,
        formId:             ctx.formId,
        movementSequence:   ctx.movementSequence ?? 1,

        // ── Acesso aos campos do formulário ──────────────────────────────────
        getValue(fieldName: string): string {
            return fields[fieldName] ?? '';
        },
        setValue(fieldName: string, value: string): void {
            fields[fieldName] = String(value);
            changed[fieldName] = String(value);
        },

        // Acesso interno após execução (não visível ao script)
        _changedFields: changed,
    };
}
