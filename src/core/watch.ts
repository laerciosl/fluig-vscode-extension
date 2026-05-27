import * as vscode from 'vscode';
import { basename } from 'path';
import { exportOne as exportDataset } from '../fluig/datasets/dataset.service';
import { exportOne as exportForm } from '../fluig/forms/form.service';
import { exportOne as exportGlobalEvent } from '../fluig/events/global-event.service';
import { updateWorkflowEvents, exportMechanism } from '../fluig/workflow/workflow.service';
import { exportWidget } from '../fluig/widgets/widget.service';
import { getRuntime } from './runtime-state';
import { logInfo } from './output';

const CONFIG_KEY = 'autoExportOnSave';
const DEBOUNCE_MS = 500;
const MAX_RETRIES = 2;

export type ExportType = 'dataset' | 'form' | 'globalEvent' | 'workflow' | 'mechanism' | 'widget';

export function resolveExportType(filePath: string): ExportType | null {
    if (/[/\\]datasets[/\\].+$/.test(filePath))                  return 'dataset';
    if (/[/\\]forms[/\\].+$/.test(filePath))                     return 'form';       // antes de events
    if (/[/\\]events[/\\].+$/.test(filePath))                    return 'globalEvent';
    if (/[/\\]workflow[/\\]scripts[/\\].+\.js$/.test(filePath))  return 'workflow';
    if (/[/\\]mechanisms[/\\].+$/.test(filePath))                return 'mechanism';
    if (/[/\\]widget[/\\].+$/.test(filePath))                    return 'widget';
    return null;
}

function isEnabled(): boolean {
    return vscode.workspace.getConfiguration('fluiggers').get<boolean>(CONFIG_KEY, false);
}

function updateStatusBar(item: vscode.StatusBarItem): void {
    if (isEnabled()) {
        item.text = '$(cloud-upload) Fluig';
        item.tooltip = 'Auto Export: ON — clique para desativar';
        item.backgroundColor = undefined;
    } else {
        item.text = '$(circle-outline) Fluig';
        item.tooltip = 'Auto Export: OFF — clique para ativar';
        item.backgroundColor = undefined;
    }
}

async function resolveExport(fileUri: vscode.Uri, context: vscode.ExtensionContext): Promise<void> {
    switch (resolveExportType(fileUri.path)) {
        case 'dataset':     await exportDataset(fileUri); break;
        case 'globalEvent': await exportGlobalEvent(fileUri); break;
        case 'workflow':    await updateWorkflowEvents(fileUri); break;
        case 'mechanism':   await exportMechanism(fileUri); break;
        case 'form':        await exportForm(context, fileUri); break;
        case 'widget':      await exportWidget(fileUri); break;
    }
}

function scheduleExport(fileUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const name = basename(fileUri.fsPath);
    getRuntime().deployQueue.enqueue(
        fileUri.fsPath,
        async () => {
            logInfo(`Exportando: ${name}`);
            await resolveExport(fileUri, context);
        },
        { debounceMs: DEBOUNCE_MS, maxRetries: MAX_RETRIES }
    );
}

export function registerWatchMode(context: vscode.ExtensionContext): void {
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'fluiggers-fluig-vscode-extension.toggleAutoExport';
    updateStatusBar(statusBar);
    statusBar.show();

    context.subscriptions.push(
        statusBar,
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.toggleAutoExport',
            async () => {
                const config = vscode.workspace.getConfiguration('fluiggers');
                await config.update(CONFIG_KEY, !isEnabled(), vscode.ConfigurationTarget.Workspace);
                updateStatusBar(statusBar);
            }
        ),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('fluiggers.autoExportOnSave')) {
                updateStatusBar(statusBar);
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            getRuntime().checkModified(document.uri);
            if (!isEnabled()) {
                return;
            }
            scheduleExport(document.uri, context);
        })
    );
}
