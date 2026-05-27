import { Uri, window, ProgressLocation } from 'vscode';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { runInSandbox } from './sandbox';
import { scaffoldMockDir } from './fixture.loader';
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
