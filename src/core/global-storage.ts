import { ExtensionContext } from 'vscode';
import { ServerDTO } from '../types/server.types';

export function getLastParentDocumentId(
    context: ExtensionContext,
    server: ServerDTO
): string {
    return context.globalState.get(server.id + '_lastParentDocumentId') || '2';
}

export function updateLastParentDocumentId(
    context: ExtensionContext,
    server: ServerDTO,
    newValue: string
): void {
    context.globalState.update(server.id + '_lastParentDocumentId', newValue);
}
