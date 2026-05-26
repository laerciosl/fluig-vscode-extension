import * as vm from 'vm';
import { MockDataset, buildDatasetFactory } from './mocks/dataset-factory.mock';
import { buildHAPI } from './mocks/hapi.mock';
import { buildLog } from './mocks/log.mock';
import { loadCardFixture, loadDatasetFixture } from './fixture.loader';

export interface SandboxResult {
    dataset: MockDataset | null;
    logs: string[];
    error: string | null;
    elapsedMs: number;
}

export function runInSandbox(code: string): SandboxResult {
    const logs: string[] = [];

    const emit = (level: string, msg: string) => logs.push(`[${level}] ${msg}`);
    const warn = (msg: string) => logs.push(`[WARN] ${msg}`);

    const fixtures = {
        cards:   (id: string) => loadCardFixture(id, warn),
        dataset: (id: string) => loadDatasetFixture(id, warn),
    };

    const logMock    = buildLog(emit);
    const hAPI       = buildHAPI(fixtures, (msg) => emit('LOG', msg));
    const DatasetFactory = buildDatasetFactory((id) => fixtures.dataset(id));
    const ConstraintType = { MUST: 1, SHOULD: 2, MUST_NOT: 3 };

    const context = vm.createContext({
        hAPI,
        DatasetFactory,
        ConstraintType,
        log: logMock,
        fluigAPI: hAPI,
        // Safe JS globals — no require, no process, no fs
        Array, Object, String, Number, Boolean, Date, Math, JSON, RegExp, Error,
        parseInt, parseFloat, isNaN, isFinite, decodeURIComponent, encodeURIComponent,
    });

    const entry = `\n;(typeof createDataset==="function"?createDataset([],[],[]):null);`;
    const start = Date.now();

    try {
        const result = vm.runInContext(code + entry, context, { timeout: 10_000 });
        const dataset = isDataset(result) ? result : null;

        return { dataset, logs, error: null, elapsedMs: Date.now() - start };
    } catch (err: any) {
        return { dataset: null, logs, error: err.message ?? String(err), elapsedMs: Date.now() - start };
    }
}

function isDataset(obj: any): obj is MockDataset {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof obj.addColumn === 'function' &&
        typeof obj.rowsCount === 'number'
    );
}
