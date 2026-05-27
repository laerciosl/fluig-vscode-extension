import * as vscode from 'vscode';
import { createDataset } from '../generators/dataset.generator';
import { DatasetView } from '../views/dataset.view';
import { getSelect } from '../server.service';
import { Server } from '../server.model';
import {
    importOne,
    importMany,
    exportOne,
    exportFromFolder,
    importDatasetFromTree,
} from '../../fluig/datasets/dataset.service';
import { getWorkspaceUri } from '../workspace.utils';
import { DatasetProvider, DatasetItem } from '../providers/dataset.provider';

export function registerDatasetCommands(context: vscode.ExtensionContext): void {
    const provider = new DatasetProvider();
    vscode.window.registerTreeDataProvider('fluiggers-fluig-vscode-extension.datasets', provider);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.refreshDatasets',
            () => provider.refresh()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importDatasetItem',
            async (item: DatasetItem) => {
                const server = provider.currentServer() ?? await getSelect();
                if (!server) { return; }
                await importDatasetFromTree(server, item.dataset.datasetId);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.queryDatasetItem',
            (item: DatasetItem) => {
                const server = provider.currentServer();
                if (!server) { vscode.window.showWarningMessage('Conecte a um servidor.'); return; }
                new DatasetView(context, server).show();
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newDataset',
            createDataset
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importManyDataset',
            importMany
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importDataset',
            importOne
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportDataset',
            (fileUri: vscode.Uri) => {
                if (!fileUri) {
                    if (!vscode.window.activeTextEditor) {
                        vscode.window.showErrorMessage('Não há editor de texto ativo com Dataset');
                        return;
                    }
                    fileUri = vscode.window.activeTextEditor.document.uri;
                }
                exportOne(fileUri);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportDatasetFolder',
            (folderUri: vscode.Uri) => {
                const targetUri = folderUri || vscode.Uri.joinPath(getWorkspaceUri(), 'datasets');
                exportFromFolder(targetUri);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.searchDataset',
            async () => {
                const server = await getSelect();
                if (!server) {
                    return;
                }
                new DatasetView(context, new Server(server)).show();
            }
        )
    );
}
