import * as vscode from 'vscode';
import { createWorkflowEvent, createMechanism } from '../generators/workflow.generator';
import {
    updateWorkflowEvents,
    importMechanism,
    importManyMechanisms,
    exportMechanism,
} from '../../fluig/workflow/workflow.service';

export function registerWorkflowCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newWorkflowEvent',
            createWorkflowEvent
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportWorkflowEvent',
            (fileUri: vscode.Uri) => {
                if (!fileUri) {
                    if (!vscode.window.activeTextEditor) {
                        vscode.window.showErrorMessage('Não há editor de texto ativo com um Evento de Processo');
                        return;
                    }
                    fileUri = vscode.window.activeTextEditor.document.uri;
                }
                if (!fileUri.path.endsWith('.js')) {
                    vscode.window.showErrorMessage('Necessário selecionar um Evento de Processo.');
                    return;
                }
                updateWorkflowEvents(fileUri);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newMechanism',
            createMechanism
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importManyMechanisms',
            importManyMechanisms
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importMechanism',
            importMechanism
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportMechanism',
            (fileUri: vscode.Uri) => {
                if (!fileUri) {
                    if (!vscode.window.activeTextEditor) {
                        vscode.window.showErrorMessage('Não há editor de texto ativo com Mecanismo Customizado');
                        return;
                    }
                    fileUri = vscode.window.activeTextEditor.document.uri;
                }
                exportMechanism(fileUri);
            }
        )
    );
}
