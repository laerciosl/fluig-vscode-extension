import { Uri, window, ProgressLocation } from 'vscode';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { runInSandbox } from './sandbox';
import { scaffoldMockDir } from './fixture.loader';
import { MockDataset } from './mocks/dataset-factory.mock';
import { logInfo, logSuccess, logError } from '../../core/output';

export async function runDatasetLocally(fileUri: Uri): Promise<void> {
    const fileName = basename(fileUri.fsPath);
    logInfo(`─── Runtime local: ${fileName} ───`);

    scaffoldMockDir();

    let code: string;
    try {
        code = readFileSync(fileUri.fsPath, 'utf-8');
    } catch (err: any) {
        logError(`Erro ao ler arquivo: ${err.message}`);
        return;
    }

    const result = await window.withProgress(
        { location: ProgressLocation.Window, title: `Fluig: executando ${fileName}` },
        () => Promise.resolve(runInSandbox(code))
    );

    for (const entry of result.logs) {
        logInfo(entry);
    }

    if (result.error) {
        logError(`${fileName}: ${result.error}`);
        window.showErrorMessage(`Runtime error: ${result.error}`);
        return;
    }

    if (result.dataset) {
        renderTable(result.dataset, fileName, result.elapsedMs);
        logSuccess(`${result.dataset.rowsCount} linha(s) em ${result.elapsedMs}ms`);
        window.showInformationMessage(
            `Dataset executado: ${result.dataset.rowsCount} linha(s) em ${result.elapsedMs}ms`
        );
    } else {
        logSuccess(`Concluído em ${result.elapsedMs}ms — createDataset não retornou dataset`);
    }
}

function renderTable(dataset: MockDataset, fileName: string, elapsedMs: number): void {
    const cols = dataset.columns;
    const rows = dataset.rows();

    if (!cols.length) {
        logInfo('(sem colunas)');
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

    logInfo(bar('┌', '┬', '┐'));
    logInfo(row(cols));
    logInfo(bar('├', '┼', '┤'));
    for (const r of rows) {
        logInfo(row(r));
    }
    logInfo(bar('└', '┴', '┘'));
    logInfo(`${rows.length} linha(s) │ ${elapsedMs}ms │ ${fileName}`);
}
