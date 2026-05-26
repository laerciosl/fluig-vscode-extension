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
} from '../../fluig/datasets/dataset.service';
import { getWorkspaceUri } from '../workspace.utils';

export function registerDatasetCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
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
