import * as vscode from 'vscode';
import { SyncStatus, getRuntime } from './runtime-state';

const DECORATIONS: Record<SyncStatus, vscode.FileDecoration> = {
    synced: new vscode.FileDecoration(
        '✓',
        'Sincronizado com o Fluig',
        new vscode.ThemeColor('charts.green')
    ),
    modified: new vscode.FileDecoration(
        'M',
        'Alterado localmente — não exportado',
        new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
    ),
    error: new vscode.FileDecoration(
        '!',
        'Erro no último deploy',
        new vscode.ThemeColor('list.errorForeground')
    ),
};

export class SyncDecorationProvider implements vscode.FileDecorationProvider {
    readonly onDidChangeFileDecorations = getRuntime().onDidChangeSyncState;

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const status = getRuntime().getStatus(uri);
        return status ? DECORATIONS[status] : undefined;
    }
}
