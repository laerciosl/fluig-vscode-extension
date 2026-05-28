import { Uri, window, ProgressLocation } from 'vscode';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { runInSandbox } from './sandbox';
import { scaffoldMockDir } from './fixture.loader';
import { scaffoldWorkflowMockDir, loadWorkflowContextFixture } from './fixture.workflow';
import { runWorkflowEventInSandbox, WorkflowEventResult } from './workflow-sandbox';
import { MockDataset } from './mocks/dataset-factory.mock';
import { createLogger } from '../../core/logger';

const log = createLogger('[RUNTIME]');

export async function runDatasetLocally(fileUri: Uri): Promise<void> {
    const fileName = basename(fileUri.fsPath);
    log.info(`─── Runtime local: ${fileName} ───`);

    scaffoldMockDir();

    let code: string;
    try {
        code = readFileSync(fileUri.fsPath, 'utf-8');
    } catch (err: any) {
        log.error(`Erro ao ler arquivo: ${err.message}`);
        return;
    }

    const result = await window.withProgress(
        { location: ProgressLocation.Window, title: `Fluig: executando ${fileName}` },
        () => Promise.resolve(runInSandbox(code))
    );

    for (const entry of result.logs) {
        log.info(entry);
    }

    if (result.error) {
        log.error(`${fileName}: ${result.error}`);
        window.showErrorMessage(`Runtime error: ${result.error}`);
        return;
    }

    if (result.dataset) {
        renderTable(result.dataset, fileName, result.elapsedMs);
        log.success(`${result.dataset.rowsCount} linha(s) em ${result.elapsedMs}ms`);
        window.showInformationMessage(
            `Dataset executado: ${result.dataset.rowsCount} linha(s) em ${result.elapsedMs}ms`
        );
    } else {
        log.success(`Concluído em ${result.elapsedMs}ms — createDataset não retornou dataset`);
    }
}

// ── 8.3 / 8.4 / 8.5 — Runtime local de eventos de workflow ───────────────

const MOVEMENT_EVENTS = new Set(['beforeMovementOptions', 'afterMovementOptions']);

export async function runWorkflowEventLocally(fileUri: Uri): Promise<void> {
    const fileName = basename(fileUri.fsPath);

    // Extrai processId e eventName de "processId.eventName.js"
    const nameWithoutExt = basename(fileUri.fsPath, '.js');
    const dotIdx = nameWithoutExt.indexOf('.');
    if (dotIdx === -1) {
        log.error(`Nome inválido: ${fileName}. Esperado: <processId>.<eventName>.js`);
        window.showErrorMessage(`Nome de arquivo inválido. Esperado: <processId>.<eventName>.js`);
        return;
    }
    const eventName = nameWithoutExt.slice(dotIdx + 1);

    scaffoldMockDir();
    scaffoldWorkflowMockDir();

    let code: string;
    try {
        code = readFileSync(fileUri.fsPath, 'utf-8');
    } catch (err: any) {
        log.error(`Erro ao ler arquivo: ${err.message}`);
        return;
    }

    const warns: string[] = [];
    const context = loadWorkflowContextFixture((msg) => warns.push(msg));

    // 8.5 — Para eventos de movimentação, pede a sequência antes de executar
    if (MOVEMENT_EVENTS.has(eventName)) {
        const input = await window.showInputBox({
            prompt: `Sequência de movimento para simular (${eventName})`,
            value: String(context.movementSequence ?? 1),
            validateInput: (v) => (isNaN(Number(v)) ? 'Informe um número inteiro' : null),
        });
        if (input === undefined) { return; }
        context.movementSequence = parseInt(input, 10);
    }

    log.info(`─── Runtime local (workflow): ${fileName} ───`);
    log.info(`Contexto: processId=${context.processId}  cardId=${context.cardId}  activityId=${context.activityId}  colleagueId=${context.colleagueId}`);

    for (const w of warns) { log.info(`[WARN] ${w}`); }

    const result = await window.withProgress(
        { location: ProgressLocation.Window, title: `Fluig: executando ${fileName}` },
        () => Promise.resolve(runWorkflowEventInSandbox(code, eventName, context))
    );

    for (const entry of result.logs) {
        log.info(entry);
    }

    if (result.error) {
        log.error(`${fileName}: ${result.error}`);
        window.showErrorMessage(`Runtime error: ${result.error}`);
        return;
    }

    renderWorkflowResult(eventName, result.eventResult, result.changedFields, result.elapsedMs);
}

function renderWorkflowResult(
    eventName: string,
    result: WorkflowEventResult,
    changedFields: Record<string, string>,
    elapsedMs: number
): void {
    log.info(`─── Resultado: ${eventName} ───`);

    if (result.kind === 'validate') {
        if (result.valid) {
            log.success(`✓ Validação OK — sem erros retornados`);
            window.showInformationMessage(`✓ ${eventName}: Validação OK`);
        } else {
            log.error(`✗ Validação FALHOU — ${result.errors.length} erro(s):`);
            for (const e of result.errors) {
                log.info(`  • ${e}`);
            }
            window.showWarningMessage(`✗ ${eventName}: ${result.errors.length} erro(s) de validação`);
        }
    } else if (result.kind === 'movements') {
        log.info(`${result.movements.length} movimento(s) retornado(s):`);
        if (result.movements.length === 0) {
            log.info('  (nenhum movimento retornado)');
        } else {
            log.info('  Seq   Condição   Visível');
            for (const m of result.movements) {
                const seq  = String(m.sequence ?? m.seq ?? '—').padEnd(5);
                const cond = String(m.condition ?? m.condicao ?? '—').padEnd(10);
                const vis  = String(m.visible ?? m.visivel ?? '—');
                log.info(`  ${seq} ${cond} ${vis}`);
            }
        }
        window.showInformationMessage(`${eventName}: ${result.movements.length} movimento(s) retornado(s)`);
    } else {
        log.info('Evento executado.');
        if (result.returnValue !== undefined && result.returnValue !== null) {
            log.info(`Retorno: ${JSON.stringify(result.returnValue)}`);
        }
        window.showInformationMessage(`${eventName}: executado em ${elapsedMs}ms`);
    }

    const changedKeys = Object.keys(changedFields);
    if (changedKeys.length > 0) {
        log.info(`─── Campos alterados via setValue() ───`);
        for (const key of changedKeys) {
            log.info(`  ${key} = "${changedFields[key]}"`);
        }
    }

    log.success(`Concluído em ${elapsedMs}ms`);
}

// ── Dataset runtime ───────────────────────────────────────────────────────

function renderTable(dataset: MockDataset, fileName: string, elapsedMs: number): void {
    const cols = dataset.columns;
    const rows = dataset.rows();

    if (!cols.length) {
        log.info('(sem colunas)');
        return;
    }

    const widths = cols.map((col, i) => {
        const maxData = rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), 0);
        return Math.max(col.length, maxData, 3);
    });

    const bar = (l: string, m: string, r: string) =>
        l + widths.map(w => '─'.repeat(w + 2)).join(m) + r;

    const row = (values: (string | number | null | undefined)[]) =>
        '│' + values.map((v, i) => ` ${String(v ?? '').padEnd(widths[i])} `).join('│') + '│';

    log.info(bar('┌', '┬', '┐'));
    log.info(row(cols));
    log.info(bar('├', '┼', '┤'));
    for (const r of rows) {
        log.info(row(r));
    }
    log.info(bar('└', '┴', '┘'));
    log.info(`${rows.length} linha(s) │ ${elapsedMs}ms │ ${fileName}`);
}
