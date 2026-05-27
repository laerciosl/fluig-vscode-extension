import * as vscode from 'vscode';
import { getRuntime } from './runtime-state';
import { Server } from './server.model';
import { getSelect } from './server.service';

const CONFIG_KEY = 'autoExportOnSave';

function isWatchEnabled(): boolean {
    return vscode.workspace.getConfiguration('fluiggers').get<boolean>(CONFIG_KEY, false);
}

export function registerStatusBar(context: vscode.ExtensionContext): void {
    const runtime = getRuntime();

    // ── Server item ───────────────────────────────────────────────────────────
    const serverItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    serverItem.command = 'fluiggers-fluig-vscode-extension.selectServer';

    function updateServerItem(server: Server | null): void {
        if (server) {
            serverItem.text = `$(circle-filled) ${server.name}`;
            serverItem.tooltip = `Fluig: conectado a "${server.name}" — clique para trocar`;
            serverItem.color = new vscode.ThemeColor('testing.iconPassed');
            serverItem.backgroundColor = undefined;
        } else {
            serverItem.text = '$(circle-outline) Fluig';
            serverItem.tooltip = 'Fluig: sem servidor conectado — clique para conectar';
            serverItem.color = undefined;
            serverItem.backgroundColor = undefined;
        }
    }

    updateServerItem(runtime.activeServer);
    serverItem.show();

    // ── Watch item ────────────────────────────────────────────────────────────
    const watchItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    watchItem.command = 'fluiggers-fluig-vscode-extension.toggleAutoExport';

    function updateWatchItem(): void {
        if (isWatchEnabled()) {
            watchItem.text = '$(cloud-upload) Watch';
            watchItem.tooltip = 'Fluig Auto Export: ativado — clique para desativar';
            watchItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            watchItem.text = '$(circle-outline) Watch';
            watchItem.tooltip = 'Fluig Auto Export: desativado — clique para ativar';
            watchItem.backgroundColor = undefined;
        }
    }

    updateWatchItem();
    watchItem.show();

    // ── Deploys item ──────────────────────────────────────────────────────────
    const deploysItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    deploysItem.tooltip = 'Fluig: deploys em andamento';
    deploysItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

    function updateDeploysItem(size: number): void {
        if (size > 0) {
            deploysItem.text = `$(loading~spin) ${size}`;
            deploysItem.show();
        } else {
            deploysItem.hide();
        }
    }

    context.subscriptions.push(
        serverItem,
        watchItem,
        deploysItem,

        runtime.onDidSelectServer(server => updateServerItem(server)),
        runtime.onDidChangeDeploySize(size => updateDeploysItem(size)),

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('fluiggers.autoExportOnSave')) {
                updateWatchItem();
            }
        }),

        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.selectServer',
            () => getSelect()
        ),
    );
}
