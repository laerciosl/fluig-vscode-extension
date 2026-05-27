import { window, workspace, Uri, ProgressLocation } from 'vscode';
import { basename } from 'path';
import { readFileSync } from 'fs';
import { glob } from 'glob';
import { ServerDTO } from '../../types/server.types';
import { DatasetDTO, DatasetStructureDTO } from './dataset.types';
import { mapDatasetResult } from './dataset.mapper';
import { promptUniqueDatasetId } from './dataset.validator';
import { getWorkspaceUri, confirmPassword } from '../../core/workspace.utils';
import { getSelect } from '../../core/server.service';
import { createLogger } from '../../core/logger';

const log = createLogger('[DATASET]');
import { emitSuccess, emitError } from '../../core/event-bus';
import {
    apiFindAllDatasets,
    apiLoadDataset,
    apiGetDatasetResult,
    apiCreateDataset,
    apiUpdateDataset,
} from '@fluiggers/sdk';

// ── Queries ────────────────────────────────────────────────────────────────

export async function getDatasets(server: ServerDTO): Promise<DatasetDTO[]> {
    return apiFindAllDatasets(server);
}

export async function getCustomDatasets(server: ServerDTO): Promise<DatasetDTO[]> {
    const datasets = await getDatasets(server);
    return datasets.filter(ds => ds.type === 'CUSTOM');
}

export async function getDataset(server: ServerDTO, datasetId: string): Promise<any> {
    return apiLoadDataset(server, datasetId);
}

export async function getResultDataset(
    server: ServerDTO,
    datasetId: string,
    fields: string[],
    constraints: [],
    order: string[]
) {
    const raw = await apiGetDatasetResult(server, datasetId, fields, constraints, order);
    return mapDatasetResult(raw);
}

// ── Import ─────────────────────────────────────────────────────────────────

export async function importOne(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const dataset: any = await pickDataset(server);
    if (!dataset) {
        return;
    }

    const datasetId = dataset.datasetPK.datasetId;
    log.info(`Importando dataset: ${datasetId} ← ${server.name}`);
    const folderUri = Uri.joinPath(getWorkspaceUri(), 'datasets');
    const existing = glob.sync(`${folderUri.fsPath}/**/${datasetId}.js`, { nodir: true });

    if (existing.length === 1) {
        const fileUri = Uri.file(existing[0]);
        await workspace.fs.writeFile(fileUri, Buffer.from(dataset.datasetImpl, 'utf-8'));
        window.showTextDocument(fileUri);
        emitSuccess({ kind: 'dataset', operation: 'import', name: datasetId, serverName: server.name, uri: fileUri });
    } else {
        await saveFile(datasetId, dataset.datasetImpl, true, server.name);
    }
}

export async function importMany(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const selections = await pickManyDatasets(server);
    if (!selections?.length) {
        return;
    }

    log.info(`Importando ${selections.length} dataset(s) ← ${server.name}`);
    const folderUri = Uri.joinPath(getWorkspaceUri(), 'datasets');

    const results = await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Importando Datasets.', cancellable: false },
        progress => {
            const increment = 100 / selections.length;
            let current = 0;
            progress.report({ increment: 0 });

            return Promise.all(
                selections.map(async (item: any) => {
                    const dataset = await item;
                    const datasetId = dataset.datasetPK.datasetId;
                    const existing = glob.sync(`${folderUri.fsPath}/**/${datasetId}.js`, { nodir: true });

                    if (existing.length === 1) {
                        const fileUri = Uri.file(existing[0]);
                        await workspace.fs.writeFile(fileUri, Buffer.from(dataset.datasetImpl, 'utf-8'));
                        emitSuccess({ kind: 'dataset', operation: 'import', name: datasetId, serverName: server.name, uri: fileUri, silent: true });
                    } else {
                        await saveFile(datasetId, dataset.datasetImpl, false, server.name);
                    }
                    current += increment;
                    progress.report({ increment: current });
                    return true;
                })
            );
        }
    );

    window.showInformationMessage(`${results.length} dataset(s) importado(s).`);
}

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportOne(fileUri: Uri): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const datasets = await getCustomDatasets(server);
    const items: { label: string }[] = [];
    let datasetIdSelected = '';
    let datasetId = basename(fileUri.fsPath, '.js');
    log.info(`Exportando dataset: ${datasetId} → ${server.name}`);

    for (const ds of datasets) {
        if (ds.datasetId !== datasetId) {
            items.push({ label: ds.datasetId });
        } else {
            datasetIdSelected = ds.datasetId;
        }
    }

    items.unshift({ label: 'Novo dataset' });
    if (datasetIdSelected) {
        items.unshift({ label: datasetIdSelected });
    }

    const selected = await window.showQuickPick(items, { placeHolder: 'Criar ou editar dataset?' });
    if (!selected) {
        return;
    }

    const isNew = selected.label === 'Novo dataset';
    let datasetStructure: DatasetStructureDTO | undefined;
    let description = '';

    if (isNew) {
        datasetId = (await promptUniqueDatasetId(datasets, server.name, datasetId)) || '';
        if (!datasetId) {
            return;
        }

        description =
            (await window.showInputBox({
                prompt: 'Qual a descrição do dataset?',
                placeHolder: 'Descrição do dataset',
                value: datasetId,
            })) || '';

        datasetStructure = buildNewDatasetStructure(server.companyId, datasetId);
    } else {
        datasetId = selected.label;
        datasetStructure = await getDataset(server, datasetId);

        description =
            (await window.showInputBox({
                prompt: 'Qual a descrição do dataset?',
                placeHolder: 'Descrição do dataset',
                value: datasetStructure?.datasetDescription || datasetId,
            })) || '';
    }

    if (!description || !datasetStructure) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    datasetStructure.datasetDescription = description;
    datasetStructure.datasetImpl = readFileSync(fileUri.fsPath, 'utf8');

    const result: any = isNew
        ? await apiCreateDataset(server, datasetStructure)
        : await apiUpdateDataset(server, datasetStructure);

    if (result.content === 'OK') {
        emitSuccess({ kind: 'dataset', operation: 'export', name: datasetId, serverName: server.name, uri: fileUri });
    } else {
        emitError({ kind: 'dataset', operation: 'export', name: datasetId, serverName: server.name, uri: fileUri, error: result.message?.message || 'Falha desconhecida' });
    }
}

export async function exportFromFolder(folderUri: Uri): Promise<void> {
    const datasetFiles: { label: string; path: string }[] = glob
        .sync(`${folderUri.fsPath}/**/*.js`, { nodir: true })
        .map(p => ({ label: basename(p, '.js'), path: p }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (!datasetFiles.length) {
        window.showWarningMessage('Nenhum arquivo de dataset encontrado!');
        return;
    }

    const selectedFiles =
        (await window.showQuickPick(datasetFiles, {
            placeHolder: 'Selecione os datasets para exportar',
            canPickMany: true,
        })) || [];

    if (!selectedFiles.length) {
        return;
    }

    const server = await getSelect();
    if (!server) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    const askDescription =
        (await window.showQuickPick(['Sim', 'Não'], {
            placeHolder: 'Deseja informar a descrição dos novos datasets?',
        })) === 'Sim';

    const itemsToExport = await buildExportFunctions(server, selectedFiles, askDescription);
    if (!itemsToExport) {
        return;
    }

    let results: { datasetId: string; success: boolean; message: any }[] = [];

    if (askDescription && itemsToExport.createFunctions.length) {
        if (itemsToExport.updateFunctions.length) {
            results = await window.withProgress(
                { location: ProgressLocation.Notification, title: 'Exportando Datasets que serão atualizados.', cancellable: false },
                progress => {
                    const increment = 100 / itemsToExport.updateFunctions.length;
                    let current = 0;
                    progress.report({ increment: 0 });
                    return Promise.all(itemsToExport.updateFunctions.map(async f => {
                        const r = await f();
                        current += increment;
                        progress.report({ increment: current });
                        return r;
                    }));
                }
            );
        }
        for (const fn of itemsToExport.createFunctions) {
            results.push(await fn());
        }
    } else {
        const allFunctions = [...itemsToExport.updateFunctions, ...itemsToExport.createFunctions];
        results = await window.withProgress(
            { location: ProgressLocation.Notification, title: 'Exportando todos os Datasets selecionados', cancellable: false },
            progress => {
                const increment = 100 / allFunctions.length;
                let current = 0;
                progress.report({ increment: 0 });
                return Promise.all(allFunctions.map(async f => {
                    const r = await f();
                    current += increment;
                    progress.report({ increment: current });
                    return r;
                }));
            }
        );
    }

    for (const r of results) {
        if (r.success) {
            emitSuccess({ kind: 'dataset', operation: 'export', name: r.datasetId, serverName: server.name });
        } else {
            emitError({ kind: 'dataset', operation: 'export', name: r.datasetId, serverName: server.name, error: r.message });
        }
    }
}

// ── File helpers ───────────────────────────────────────────────────────────

export async function saveFile(name: string, content: string, openFile = true, serverName = ''): Promise<void> {
    const datasetUri = Uri.joinPath(getWorkspaceUri(), 'datasets', name + '.js');
    await workspace.fs.writeFile(datasetUri, Buffer.from(content, 'utf-8'));
    emitSuccess({ kind: 'dataset', operation: 'import', name, serverName, uri: datasetUri, silent: !openFile });
    if (openFile) {
        window.showTextDocument(datasetUri);
    }
}

// ── Tree-based import (pre-resolved item, no QuickPick) ───────────────────

export async function importDatasetFromTree(server: ServerDTO, datasetId: string): Promise<void> {
    log.info(`Importando dataset: ${datasetId} ← ${server.name}`);
    const dataset: any = await apiLoadDataset(server, datasetId);
    const folderUri = Uri.joinPath(getWorkspaceUri(), 'datasets');
    const existing = glob.sync(`${folderUri.fsPath}/**/${datasetId}.js`, { nodir: true });

    if (existing.length === 1) {
        const fileUri = Uri.file(existing[0]);
        await workspace.fs.writeFile(fileUri, Buffer.from(dataset.datasetImpl, 'utf-8'));
        window.showTextDocument(fileUri);
        emitSuccess({ kind: 'dataset', operation: 'import', name: datasetId, serverName: server.name, uri: fileUri });
    } else {
        await saveFile(datasetId, dataset.datasetImpl, true, server.name);
    }
}

// ── Remote content for diff ────────────────────────────────────────────────

export async function getDatasetContent(server: ServerDTO, datasetId: string): Promise<string> {
    const dataset: any = await apiLoadDataset(server, datasetId);
    return (dataset?.datasetImpl as string) ?? '';
}

// ── QuickPick helpers ──────────────────────────────────────────────────────

export async function pickDataset(server: ServerDTO): Promise<any> {
    const datasets = await getCustomDatasets(server);
    const items = datasets.map(ds => ({ label: ds.datasetId }));
    const result = await window.showQuickPick(items, { placeHolder: 'Selecione o dataset' });
    if (!result) {
        return undefined;
    }
    return getDataset(server, result.label);
}

export async function pickManyDatasets(server: ServerDTO): Promise<any[]> {
    const datasets = await getCustomDatasets(server);
    const items = datasets.map(ds => ({ label: ds.datasetId }));
    const result = await window.showQuickPick(items, {
        placeHolder: 'Selecione o dataset',
        canPickMany: true,
    });
    if (!result) {
        window.showErrorMessage('Falha ao selecionar o(s) dataset(s)!');
        return [];
    }
    return result.map(item => getDataset(server, item.label));
}

// ── Internal ───────────────────────────────────────────────────────────────

function buildNewDatasetStructure(companyId: number, datasetId: string): DatasetStructureDTO {
    return {
        datasetPK: { companyId, datasetId },
        datasetDescription: '',
        datasetImpl: '',
        datasetBuilder: 'com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder',
        serverOffline: false,
        mobileCache: false,
        lastReset: 0,
        lastRemoteSync: 0,
        type: 'CUSTOM',
        mobileOffline: false,
        updateIntervalTimestamp: 0,
    };
}

async function buildExportFunctions(
    server: ServerDTO,
    selectedDatasets: { label: string; path: string }[],
    askDescription: boolean
) {
    try {
        const existing = await getCustomDatasets(server);
        const toUpdate = selectedDatasets.filter(ds => existing.find(e => e.datasetId === ds.label));
        const toCreate = selectedDatasets.filter(ds => !toUpdate.includes(ds));

        const updateFunctions = toUpdate.map(ds => async () => {
            const structure = await getDataset(server, ds.label);
            structure.datasetImpl = readFileSync(ds.path, 'utf8');
            const result: any = await apiUpdateDataset(server, structure);
            return { datasetId: ds.label, success: result.content === 'OK', message: result.message?.message || '' };
        });

        const createFunctions = toCreate.map(ds => async () => {
            let description = ds.label;
            if (askDescription) {
                description =
                    (await window.showInputBox({
                        prompt: `Qual a descrição do dataset ${ds.label}?`,
                        placeHolder: 'Descrição do dataset',
                        value: ds.label,
                    })) || ds.label;
            }
            const structure = buildNewDatasetStructure(server.companyId, ds.label);
            structure.datasetDescription = description;
            structure.datasetImpl = readFileSync(ds.path, 'utf8');
            const result: any = await apiCreateDataset(server, structure);
            return { datasetId: ds.label, success: result.content === 'OK', message: result.message?.message || '' };
        });

        return { updateFunctions, createFunctions };
    } catch {
        window.showErrorMessage('Falha ao consultar os datasets já existentes.');
        return null;
    }
}
