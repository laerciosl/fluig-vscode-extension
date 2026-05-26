import * as vscode from 'vscode';
import { createWidget } from '../generators/widget.generator';
import {
    exportWidget,
    exportFluiggersWidget,
    importWidget,
} from '../../fluig/widgets/widget.service';

export function registerWidgetCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
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
            exportFluiggersWidget
        )
    );
}
