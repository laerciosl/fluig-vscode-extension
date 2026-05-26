import * as vscode from 'vscode';
import { createGlobalEvent } from '../generators/global-event.generator';
import {
    importOne,
    importMany,
    exportOne,
    deleteEvents,
} from '../../fluig/events/global-event.service';

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
        )
    );
}
