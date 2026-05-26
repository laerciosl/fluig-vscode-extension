import * as vscode from 'vscode';
import { createForm, createFormEvent } from '../generators/form.generator';
import { importOne, importMany, exportOne } from '../../fluig/forms/form.service';

export function registerFormCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newForm',
            createForm
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.newFormEvent',
            createFormEvent
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importManyForm',
            importMany
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importForm',
            importOne
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.exportForm',
            (fileUri: vscode.Uri) => {
                if (!fileUri) {
                    if (!vscode.window.activeTextEditor) {
                        vscode.window.showErrorMessage('Não há editor de texto ativo com Formulário');
                        return;
                    }
                    fileUri = vscode.window.activeTextEditor.document.uri;
                }
                exportOne(context, fileUri);
            }
        )
    );
}
