import * as vscode from 'vscode';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { getWorkspaceUri } from '../workspace.utils';

export function registerLibraryCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.installDeclarationLibrary',
            installDeclarationLibrary
        )
    );
}

function installDeclarationLibrary(): void {
    const workspaceUri = getWorkspaceUri();

    Promise.all([
        fetch('https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/jsconfig.json'),
        fetch('https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/fluig.d.ts'),
    ])
        .then(function ([jsConfig, fluigDeclarations]) {
            if (!jsConfig.ok || !jsConfig.body || !fluigDeclarations.ok || !fluigDeclarations.body) {
                throw new Error('Erro: Os arquivos da biblioteca de tipos não foram encontrados.');
            }

            const jsConfigWriter = createWriteStream(vscode.Uri.joinPath(workspaceUri, 'jsconfig.json').fsPath);
            Readable.fromWeb(jsConfig.body as any).pipe(jsConfigWriter);

            const declarationsWriter = createWriteStream(vscode.Uri.joinPath(workspaceUri, 'fluig.d.ts').fsPath);
            Readable.fromWeb(fluigDeclarations.body as any).pipe(declarationsWriter);

            vscode.window.showInformationMessage('A biblioteca de Declarações de Tipos foi instalada.');
        })
        .catch(() =>
            vscode.window.showErrorMessage(
                'Erro ao baixar biblioteca do GitHub. Verifique sua conexão com a Internet'
            )
        );
}
