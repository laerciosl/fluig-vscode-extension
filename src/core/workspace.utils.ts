import * as vscode from 'vscode';
import { ServerDTO } from '../types/server.types';

export function getWorkspaceUri(): vscode.Uri {
    if (!vscode.workspace.workspaceFolders) {
        throw new Error('É necessário estar em Workspace / Diretório.');
    }
    return vscode.workspace.workspaceFolders[0].uri;
}

export function generateRandomId(): string {
    return (
        Math.random().toString(36).substring(2, 15) +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 15)
    );
}

export async function confirmPassword(server: ServerDTO): Promise<boolean> {
    let isPasswordCorrect = true;

    do {
        const confirmPwd =
            (await vscode.window.showInputBox({
                prompt: 'Informe a senha do servidor ' + server.name,
                password: true,
            })) || '';

        if (!confirmPwd) {
            return false;
        } else if (confirmPwd !== server.password) {
            vscode.window.showWarningMessage(
                `A senha informada para o servidor "${server.name}" está incorreta!`
            );
            isPasswordCorrect = false;
        } else {
            isPasswordCorrect = true;
        }
    } while (!isPasswordCorrect);

    return isPasswordCorrect;
}
