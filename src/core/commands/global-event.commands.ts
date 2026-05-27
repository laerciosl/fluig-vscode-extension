import * as vscode from 'vscode';
import { basename } from 'path';
import { createGlobalEvent } from '../generators/global-event.generator';
import {
    importOne,
    importMany,
    exportOne,
    deleteEvents,
} from '../../fluig/events/global-event.service';
import { getRuntime } from '../runtime-state';
import { buildRemoteUri } from '../diff-provider';

export function registerGlobalEventCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newGlobalEvent',
            createGlobalEvent
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportGlobalEvent',
            (fileUri: vscode.Uri) => {
                if (!fileUri) {
                    if (!vscode.window.activeTextEditor) {
                        vscode.window.showErrorMessage('Não há editor de texto ativo com Evento Global');
                        return;
                    }
                    fileUri = vscode.window.activeTextEditor.document.uri;
                }
                exportOne(fileUri);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importManyGlobalEvent',
            importMany
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importGlobalEvent',
            importOne
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.deleteGlobalEvent',
            deleteEvents
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.diffGlobalEvent',
            async (fileUri: vscode.Uri | undefined) => {
                const server = getRuntime().activeServer;
                if (!server) {
                    vscode.window.showErrorMessage('Conecte a um servidor para comparar.');
                    return;
                }
                const uri = fileUri instanceof vscode.Uri ? fileUri : vscode.window.activeTextEditor?.document.uri;
                if (!uri) {
                    vscode.window.showErrorMessage('Nenhum arquivo de evento global selecionado.');
                    return;
                }
                const eventId = basename(uri.fsPath, '.js');
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    buildRemoteUri('global-event', eventId),
                    uri,
                    `${eventId}: Fluig ↔ Local`
                );
            }
        )
    );
}
