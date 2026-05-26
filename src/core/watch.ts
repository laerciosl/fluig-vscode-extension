import * as vscode from 'vscode';
import { exportOne as exportDataset } from '../fluig/datasets/dataset.service';
import { exportOne as exportForm } from '../fluig/forms/form.service';
import { exportOne as exportGlobalEvent } from '../fluig/events/global-event.service';
import { updateWorkflowEvents, exportMechanism } from '../fluig/workflow/workflow.service';
import { exportWidget } from '../fluig/widgets/widget.service';

const CONFIG_KEY = 'autoExportOnSave';

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

function resolveExport(fileUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const path = fileUri.path;

    if (/[/\\]datasets[/\\].+$/.test(path)) {
        void exportDataset(fileUri);
    } else if (/[/\\]events[/\\].+$/.test(path)) {
        void exportGlobalEvent(fileUri);
    } else if (/[/\\]workflow[/\\]scripts[/\\].+\.js$/.test(path)) {
        void updateWorkflowEvents(fileUri);
    } else if (/[/\\]mechanisms[/\\].+$/.test(path)) {
        void exportMechanism(fileUri);
    } else if (/[/\\]forms[/\\].+$/.test(path)) {
        void exportForm(context, fileUri);
    } else if (/[/\\]widget[/\\].+$/.test(path)) {
        void exportWidget(fileUri);
    }
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
            if (!isEnabled()) {
                return;
            }
            resolveExport(document.uri, context);
        })
    );
}
