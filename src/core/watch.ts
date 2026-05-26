import * as vscode from 'vscode';
import { basename } from 'path';
import { exportOne as exportDataset } from '../fluig/datasets/dataset.service';
import { exportOne as exportForm } from '../fluig/forms/form.service';
import { exportOne as exportGlobalEvent } from '../fluig/events/global-event.service';
import { updateWorkflowEvents, exportMechanism } from '../fluig/workflow/workflow.service';
import { exportWidget } from '../fluig/widgets/widget.service';
import { checkModified } from './sync-state';
import { enqueue } from './deploy-queue';
import { logInfo } from './output';

const CONFIG_KEY = 'autoExportOnSave';
const DEBOUNCE_MS = 500;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    const path = fileUri.path;

    if (/[/\\]datasets[/\\].+$/.test(path)) {
        await exportDataset(fileUri);
    } else if (/[/\\]events[/\\].+$/.test(path)) {
        await exportGlobalEvent(fileUri);
    } else if (/[/\\]workflow[/\\]scripts[/\\].+\.js$/.test(path)) {
        await updateWorkflowEvents(fileUri);
    } else if (/[/\\]mechanisms[/\\].+$/.test(path)) {
        await exportMechanism(fileUri);
    } else if (/[/\\]forms[/\\].+$/.test(path)) {
        await exportForm(context, fileUri);
    } else if (/[/\\]widget[/\\].+$/.test(path)) {
        await exportWidget(fileUri);
    }
}

function scheduleExport(fileUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const key = fileUri.fsPath;
    const existing = debounceTimers.get(key);
    if (existing) {
        clearTimeout(existing);
    }

    const timer = setTimeout(() => {
        debounceTimers.delete(key);
        const name = basename(key);
        enqueue(async () => {
            logInfo(`Exportando: ${name}`);
            await resolveExport(fileUri, context);
        });
    }, DEBOUNCE_MS);

    debounceTimers.set(key, timer);
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
            checkModified(document.uri);
            if (!isEnabled()) {
                return;
            }
            scheduleExport(document.uri, context);
        })
    );
}
