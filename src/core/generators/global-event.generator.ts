import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { getWorkspaceUri } from '../workspace.utils';
import { TemplateService } from '../template.service';

export async function createGlobalEvent(): Promise<void> {
    const eventName = (await vscode.window.showQuickPick(TemplateService.globalEventsNames, {
        canPickMany: false,
        placeHolder: 'Selecione o Evento',
    })) || '';

    if (!eventName) {
        return;
    }

    const eventUri = vscode.Uri.joinPath(getWorkspaceUri(), 'events', `${eventName}.js`);

    try {
        await vscode.workspace.fs.stat(eventUri);
        void vscode.window.showTextDocument(eventUri);
        return;
    } catch {
        // arquivo não existe, seguir com a criação
    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        readFileSync(
            vscode.Uri.joinPath(TemplateService.globalEventsUri, `${eventName}.js`).fsPath
        )
    );
    vscode.window.showTextDocument(eventUri);
}
