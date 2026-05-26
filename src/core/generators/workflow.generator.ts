import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { getWorkspaceUri } from '../workspace.utils';
import { TemplateService } from '../template.service';

export async function createWorkflowEvent(folderUri: vscode.Uri): Promise<void> {
    if (!folderUri) {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage(
                'Não há editor de texto ativo com Processo ou Evento de Processo'
            );
            return;
        }
        folderUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!folderUri.path.endsWith('.process') && !folderUri.path.endsWith('.js')) {
        vscode.window.showErrorMessage(
            'Necessário selecionar um Processo ou Evento de Processo para criar o Evento.'
        );
        return;
    }

    const NEW_FUNCTION = 'Nova Função';

    let eventName = (await vscode.window.showQuickPick(
        TemplateService.workflowEventsNames.concat(NEW_FUNCTION),
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

    const processName = folderUri.path.endsWith('.process')
        ? folderUri.path.replace(/.*\/workflow\/diagrams\/([^.]+)\.process$/, '$1')
        : folderUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, '$1');

    const eventUri = vscode.Uri.joinPath(
        getWorkspaceUri(),
        'workflow',
        'scripts',
        `${processName}.${eventName}.js`
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
                  vscode.Uri.joinPath(TemplateService.workflowEventsUri, `${eventName}.js`).fsPath
              )
    );

    vscode.window.showTextDocument(eventUri);
}

export async function createMechanism(): Promise<void> {
    let mechanism = (await vscode.window.showInputBox({
        prompt: 'Qual o nome do Mecanismo Customizado (sem espaços e sem caracteres especiais)?',
        placeHolder: 'mecanismo_customizado',
    })) || '';

    if (!mechanism) {
        return;
    }

    if (!mechanism.endsWith('.js')) {
        mechanism += '.js';
    }

    const mechanismUri = vscode.Uri.joinPath(getWorkspaceUri(), 'mechanisms', mechanism);

    try {
        await vscode.workspace.fs.stat(mechanismUri);
        void vscode.window.showTextDocument(mechanismUri);
        return;
    } catch {
        // arquivo não existe, seguir com a criação
    }

    await vscode.workspace.fs.writeFile(
        mechanismUri,
        readFileSync(
            vscode.Uri.joinPath(TemplateService.templatesUri, 'createMechanism.js').fsPath
        )
    );
    vscode.window.showTextDocument(mechanismUri);
}
