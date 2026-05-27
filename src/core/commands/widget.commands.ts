import * as vscode from 'vscode';
import { createWidget } from '../generators/widget.generator';
import {
    exportWidget,
    exportFluiggersWidget,
    importWidget,
    importWidgetFromTree,
} from '../../fluig/widgets/widget.service';
import { ServerItem } from '../providers/server-item.provider';
import { WidgetProvider, WidgetItem } from '../providers/widget.provider';

export function registerWidgetCommands(context: vscode.ExtensionContext): void {
    const provider = new WidgetProvider();
    vscode.window.registerTreeDataProvider('fluiggers-fluig-vscode-extension.widgets', provider);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.refreshWidgets',
            () => provider.refresh()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importWidgetItem',
            async (item: WidgetItem) => {
                const server = provider.currentServer();
                if (!server) { vscode.window.showWarningMessage('Conecte a um servidor.'); return; }
                await importWidgetFromTree(server, item.widget);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newWidget',
            createWidget
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportWidget',
            (fileUri: vscode.Uri) => {
                if (!fileUri) {
                    if (!vscode.window.activeTextEditor) {
                        vscode.window.showErrorMessage('Não há editor de texto ativo na Widget');
                        return;
                    }
                    fileUri = vscode.window.activeTextEditor.document.uri;
                }
                exportWidget(fileUri);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importWidget',
            importWidget
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportFluiggersWidget',
            (serverItem?: ServerItem) => exportFluiggersWidget(serverItem?.server)
        )
    );
}
