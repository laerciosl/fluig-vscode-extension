import * as vscode from 'vscode';
import { basename } from 'path';
import { createWorkflowEvent, createMechanism } from '../generators/workflow.generator';
import { runWorkflowEventLocally } from '../../fluig/runtime/runtime.service';
import {
    updateWorkflowEvents,
    importMechanism,
    importManyMechanisms,
    exportMechanism,
    deploySelectedWorkflowEvents,
} from '../../fluig/workflow/workflow.service';
import { WorkflowProvider, WorkflowEventItem, WorkflowProcessItem } from '../providers/workflow.provider';
import { getRuntime } from '../runtime-state';
import { buildRemoteUri } from '../diff-provider';

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
            'fluiggers-fluig-vscode-extension.selectiveDeployWorkflow',
            deploySelectedWorkflowEvents
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.runWorkflowEventLocally',
            (fileUri: vscode.Uri) => {
                const uri = fileUri instanceof vscode.Uri
                    ? fileUri
                    : vscode.window.activeTextEditor?.document.uri;
                if (!uri) {
                    vscode.window.showErrorMessage('Nenhum evento de workflow selecionado.');
                    return;
                }
                runWorkflowEventLocally(uri);
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
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.diffMechanism',
            async (fileUri: vscode.Uri | undefined) => {
                const server = getRuntime().activeServer;
                if (!server) {
                    vscode.window.showErrorMessage('Conecte a um servidor para comparar.');
                    return;
                }
                const uri = fileUri instanceof vscode.Uri ? fileUri : vscode.window.activeTextEditor?.document.uri;
                if (!uri) {
                    vscode.window.showErrorMessage('Nenhum arquivo de mecanismo selecionado.');
                    return;
                }
                const mechanismId = basename(uri.fsPath, '.js');
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    buildRemoteUri('mechanism', mechanismId),
                    uri,
                    `${mechanismId}: Fluig ↔ Local`
                );
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.diffWorkflowEvent',
            async (item: WorkflowEventItem | vscode.Uri | undefined) => {
                const server = getRuntime().activeServer;
                if (!server) {
                    vscode.window.showErrorMessage('Conecte a um servidor para comparar.');
                    return;
                }

                let localUri: vscode.Uri;
                let processId: string;
                let eventName: string;

                if (item instanceof WorkflowEventItem) {
                    localUri = vscode.Uri.file(item.filePath);
                    processId = item.processId;
                    eventName = item.eventName;
                } else {
                    const fileUri = item instanceof vscode.Uri ? item : vscode.window.activeTextEditor?.document.uri;
                    if (!fileUri) {
                        vscode.window.showErrorMessage('Nenhum arquivo de evento de processo selecionado.');
                        return;
                    }
                    localUri = fileUri;
                    const match = fileUri.fsPath.match(/([^/\\]+)\.([^.]+)\.js$/);
                    if (!match) {
                        vscode.window.showErrorMessage('Nome do arquivo inválido. Esperado: {processo}.{evento}.js');
                        return;
                    }
                    [, processId, eventName] = match;
                }

                await vscode.commands.executeCommand(
                    'vscode.diff',
                    buildRemoteUri('workflow-event', `${processId}/${eventName}`),
                    localUri,
                    `${processId}.${eventName}: Fluig ↔ Local`
                );
            }
        )
    );
}
