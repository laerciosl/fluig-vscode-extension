import * as vm from 'vm';
import { buildDatasetFactory } from './mocks/dataset-factory.mock';
import { buildHAPI } from './mocks/hapi.mock';
import { buildLog } from './mocks/log.mock';
import { buildWorkflowGlobals, WorkflowContext } from './mocks/workflow.mock';
import { loadCardFixture, loadDatasetFixture } from './fixture.loader';

export type WorkflowEventResult =
    | { kind: 'validate'; valid: boolean; errors: string[] }
    | { kind: 'movements'; movements: any[] }
    | { kind: 'void'; returnValue?: any };

export interface WorkflowSandboxResult {
    logs: string[];
    error: string | null;
    elapsedMs: number;
    changedFields: Record<string, string>;
    eventResult: WorkflowEventResult;
}

export function runWorkflowEventInSandbox(
    code: string,
    eventName: string,
    context: WorkflowContext
): WorkflowSandboxResult {
    const logs: string[] = [];
    const emit = (level: string, msg: string) => logs.push(`[${level}] ${msg}`);
    const warn = (msg: string) => logs.push(`[WARN] ${msg}`);

    const fixtures = {
        cards:   (id: string) => loadCardFixture(id, warn),
        dataset: (id: string) => loadDatasetFixture(id, warn),
    };

    const logMock         = buildLog(emit);
    const hAPI            = buildHAPI(fixtures, (msg) => emit('LOG', msg));
    const DatasetFactory  = buildDatasetFactory((id) => fixtures.dataset(id));
    const ConstraintType  = { MUST: 1, SHOULD: 2, MUST_NOT: 3 };
    const workflowGlobals = buildWorkflowGlobals(context);

    const vmContext = vm.createContext({
        ...workflowGlobals,
        hAPI,
        DatasetFactory,
        ConstraintType,
        log: logMock,
        fluigAPI: hAPI,
        Array, Object, String, Number, Boolean, Date, Math, JSON, RegExp, Error,
        parseInt, parseFloat, isNaN, isFinite, decodeURIComponent, encodeURIComponent,
    });

    const entry = buildEntry(eventName, context.movementSequence ?? 1);
    const start = Date.now();

    try {
        const returnValue = vm.runInContext(code + entry, vmContext, { timeout: 10_000 });
        const changedFields = workflowGlobals._changedFields as Record<string, string>;

        return {
            logs,
            error: null,
            elapsedMs: Date.now() - start,
            changedFields,
            eventResult: classifyResult(eventName, returnValue),
        };
    } catch (err: any) {
        return {
            logs,
            error: err.message ?? String(err),
            elapsedMs: Date.now() - start,
            changedFields: {},
            eventResult: { kind: 'void' },
        };
    }
}

function buildEntry(eventName: string, movSequence: number): string {
    if (eventName === 'beforeMovementOptions' || eventName === 'afterMovementOptions') {
        return `\n;(typeof ${eventName}==="function"?${eventName}(${movSequence}):null);`;
    }
    return `\n;(typeof ${eventName}==="function"?${eventName}():null);`;
}

function classifyResult(eventName: string, returnValue: any): WorkflowEventResult {
    if (eventName === 'beforeSendValidate' || eventName === 'afterSendValidate') {
        if (returnValue === true || returnValue === null || returnValue === undefined) {
            return { kind: 'validate', valid: true, errors: [] };
        }
        if (typeof returnValue === 'string') {
            return { kind: 'validate', valid: false, errors: [returnValue] };
        }
        if (Array.isArray(returnValue)) {
            const errors = returnValue.map(String);
            return { kind: 'validate', valid: errors.length === 0, errors };
        }
        return { kind: 'validate', valid: false, errors: [String(returnValue)] };
    }

    if (eventName === 'beforeMovementOptions' || eventName === 'afterMovementOptions') {
        return { kind: 'movements', movements: Array.isArray(returnValue) ? returnValue : [] };
    }

    return { kind: 'void', returnValue };
}
