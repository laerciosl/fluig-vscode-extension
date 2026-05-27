import * as vscode from 'vscode';
import { createForm, createFormEvent } from '../generators/form.generator';
import { importOne, importMany, exportOne, importFormFromTree } from '../../fluig/forms/form.service';
import { FormProvider, FormItem } from '../providers/form.provider';

export function registerFormCommands(context: vscode.ExtensionContext): void {
    const provider = new FormProvider();
    vscode.window.registerTreeDataProvider('fluiggers-fluig-vscode-extension.forms', provider);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.refreshForms',
            () => provider.refresh()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.importFormItem',
            async (item: FormItem) => {
                const server = provider.currentServer();
                if (!server) { vscode.window.showWarningMessage('Conecte a um servidor.'); return; }
                await importFormFromTree(server, item.form);
            }
        ),
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
