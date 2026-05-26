import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { getWorkspaceUri } from '../workspace.utils';
import { TemplateService } from '../template.service';

export async function createForm(): Promise<void> {
    const formName = (await vscode.window.showInputBox({
        prompt: 'Qual o nome do Formulário (sem espaços e sem caracteres especiais)?',
        placeHolder: 'NomeFormulario',
    })) || '';

    if (!formName) {
        return;
    }

    const formUri = vscode.Uri.joinPath(
        getWorkspaceUri(),
        'forms',
        formName,
        `${formName}.html`
    );

    try {
        await vscode.workspace.fs.stat(formUri);
        void vscode.window.showTextDocument(formUri);
        return;
    } catch {
        // arquivo não existe, seguir com a criação
    }

    await vscode.workspace.fs.writeFile(
        formUri,
        readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'form.html').fsPath)
    );
    vscode.window.showTextDocument(formUri);
}

export async function createFormEvent(folderUri: vscode.Uri): Promise<void> {
    if (!folderUri) {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage('Não há editor de texto ativo com Dataset');
            return;
        }
        folderUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!folderUri.path.includes('/forms/')) {
        vscode.window.showErrorMessage('Necessário selecionar um formulário para criar o evento.');
        return;
    }

    const formName = folderUri.path.replace(/.*\/forms\/([^/]+).*/, '$1');
    const NEW_FUNCTION = 'Nova Função';

    let eventName = (await vscode.window.showQuickPick(
        TemplateService.formEventsNames.concat(NEW_FUNCTION),
        { canPickMany: false, placeHolder: 'Selecione o Evento' }
    )) || '';

    if (!eventName) {
        return;
    }

    let isNewFunction = false;

    if (eventName === NEW_FUNCTION) {
        eventName = (await vscode.window.showInputBox({
            prompt: 'Qual o nome da Nova Função (sem espaços e sem caracteres especiais)?',
            placeHolder: 'nomeFuncao',
        })) || '';

        if (!eventName) {
            return;
        }

        isNewFunction = true;
    }

    const eventUri = vscode.Uri.joinPath(
        getWorkspaceUri(),
        'forms',
        formName,
        'events',
        `${eventName}.js`
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        void vscode.window.showTextDocument(eventUri);
        return;
    } catch {
        // arquivo não existe, seguir com a criação
    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        isNewFunction
            ? Buffer.from(TemplateService.createEmptyFunction(eventName), 'utf-8')
            : readFileSync(
                  vscode.Uri.joinPath(TemplateService.formEventsUri, `${eventName}.js`).fsPath
              )
    );

    vscode.window.showTextDocument(eventUri);
}
