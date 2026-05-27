import * as vscode from 'vscode';
import { createWorkflowEvent, createMechanism } from '../generators/workflow.generator';
import {
    updateWorkflowEvents,
    importMechanism,
    importManyMechanisms,
    exportMechanism,
} from '../../fluig/workflow/workflow.service';
import { WorkflowProvider, WorkflowEventItem, WorkflowProcessItem } from '../providers/workflow.provider';

export function registerWorkflowCommands(context: vscode.ExtensionContext): void {
    const provider = new WorkflowProvider();
    vscode.window.registerTreeDataProvider('fluiggers-fluig-vscode-extension.workflows', provider);

    context.subscriptions.push(
        { dispose: () => provider.dispose() },
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.refreshWorkflows',
            () => provider.refresh()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportWorkflowProcess',
            (item: WorkflowProcessItem) => {
                // Export all events of this process — uses first event file as entry point
                // The updateWorkflowEvents command handles multi-event selection internally
                const uri = vscode.Uri.joinPath(
                    vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'workflow', 'scripts'),
                );
                vscode.window.showInformationMessage(
                    `Use o botão direito em um evento de ${item.processId} para exportar.`
                );
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportWorkflowEventItem',
            (item: WorkflowEventItem) => {
                updateWorkflowEvents(vscode.Uri.file(item.filePath));
            }
        ),
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
