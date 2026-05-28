import * as vscode from 'vscode';
import { parseProcess } from './process.parser';
import { ProcessDefinition } from './process.types';

/**
 * Cache simples por URI + versão do documento.
 *
 * Hover e CodeLens podem disparar várias vezes em sequência; reparsear ~3000
 * linhas de XMI a cada movimento de mouse é desnecessário. O cache invalida
 * automaticamente quando o `document.version` muda.
 */
const cache = new Map<string, { version: number; def: ProcessDefinition }>();

/**
 * Retorna a definição parseada do documento, usando cache quando válido.
 * Retorna `undefined` se o parser falhar (XML malformado, etc.) — providers
 * devem degradar silenciosamente nesse caso.
 */
export function getProcessDefinition(document: vscode.TextDocument): ProcessDefinition | undefined {
    const key = document.uri.toString();
    const cached = cache.get(key);
    if (cached && cached.version === document.version) {
        return cached.def;
    }
    try {
        const def = parseProcess(document.getText());
        cache.set(key, { version: document.version, def });
        return def;
    } catch {
        cache.delete(key);
        return undefined;
    }
}

export function invalidateProcessCache(uri: vscode.Uri): void {
    cache.delete(uri.toString());
}

export function clearProcessCache(): void {
    cache.clear();
}
