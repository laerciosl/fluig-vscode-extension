import * as vscode from 'vscode';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { getProcessDefinition } from '../../fluig/workflow/process/process.cache';

/**
 * F12 / "Go to Definition" em `.process`.
 *
 * - Sobre o id de uma activity/transition: pula para o atributo `id="..."`
 *   onde está definida no XML.
 * - Sobre um `scriptFileName="..."`: abre o arquivo `.js` em `workflow/scripts/`.
 */
export class ProcessDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Definition> {
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z][\w.]*/);
        if (!wordRange) {
            return undefined;
        }
        const word = document.getText(wordRange);

        // Caso 1 — script file name (termina com .js)
        if (word.endsWith('.js')) {
            const scriptUri = vscode.Uri.file(
                join(dirname(document.uri.fsPath), 'scripts', word)
            );
            if (existsSync(scriptUri.fsPath)) {
                return new vscode.Location(scriptUri, new vscode.Position(0, 0));
            }
        }

        // Caso 2 — id de activity ou transition: localiza onde foi definido
        const def = getProcessDefinition(document);
        if (!def) {
            return undefined;
        }
        const isActivity = def.activities.some(a => a.id === word);
        const isTransition = !isActivity && def.transitions.some(t => t.id === word);
        if (!isActivity && !isTransition) {
            return undefined;
        }

        return findIdDefinition(document, word);
    }
}

/**
 * Localiza a primeira ocorrência de `id="<word>"` no documento — é onde o
 * elemento é declarado (referências em incoming/outgoing/sourceRef/etc.
 * usam o mesmo id mas sem aspas duplas no padrão exato).
 */
function findIdDefinition(
    document: vscode.TextDocument,
    id: string
): vscode.Location | undefined {
    const text = document.getText();
    const needle = `id="${id}"`;
    const idx = text.indexOf(needle);
    if (idx === -1) {
        return undefined;
    }
    const start = document.positionAt(idx + 'id="'.length);
    const end = document.positionAt(idx + needle.length - 1);
    return new vscode.Location(document.uri, new vscode.Range(start, end));
}
