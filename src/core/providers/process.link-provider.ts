import * as vscode from 'vscode';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

/**
 * `DocumentLinkProvider` para `.process`. Transforma atributos como
 * `scriptFileName="name.js"`, `process="subProcess"` e `cardIndex="formName"`
 * em links Ctrl+Click que abrem o recurso correspondente no workspace.
 */
export class ProcessLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];
        const text = document.getText();
        const baseDir = dirname(document.uri.fsPath);

        // scriptFileName="<name.js>"
        const scriptRe = /scriptFileName="([^"]+)"/g;
        for (const match of text.matchAll(scriptRe)) {
            const fileName = match[1];
            const offset = match.index! + match[0].indexOf(fileName);
            const range = new vscode.Range(
                document.positionAt(offset),
                document.positionAt(offset + fileName.length)
            );
            const target = vscode.Uri.file(join(baseDir, 'scripts', fileName));
            const link = new vscode.DocumentLink(range, target);
            link.tooltip = existsSync(target.fsPath)
                ? `Abrir ${fileName}`
                : `Arquivo ausente em workflow/scripts/ — importe-o primeiro`;
            links.push(link);
        }

        // process="<id>" em BpmnSubProcess
        const subRe = /<bpmn2:BpmnSubProcess[^>]*\bprocess="([^"]+)"/g;
        for (const match of text.matchAll(subRe)) {
            const processId = match[1];
            const inMatchOffset = match[0].lastIndexOf(processId);
            const offset = match.index! + inMatchOffset;
            const range = new vscode.Range(
                document.positionAt(offset),
                document.positionAt(offset + processId.length)
            );
            const target = vscode.Uri.file(join(baseDir, `${processId}.process`));
            const link = new vscode.DocumentLink(range, target);
            link.tooltip = existsSync(target.fsPath)
                ? `Abrir sub-processo ${processId}.process`
                : `Sub-processo ${processId}.process ausente no workspace`;
            links.push(link);
        }

        // cardIndex="<formName>" em bpmn2:BpmnProcess
        const cardRe = /\bcardIndex="([^"]+)"/g;
        for (const match of text.matchAll(cardRe)) {
            const formName = match[1];
            const offset = match.index! + match[0].indexOf(formName);
            const range = new vscode.Range(
                document.positionAt(offset),
                document.positionAt(offset + formName.length)
            );
            const formTarget = resolveFormPath(baseDir, formName);
            if (formTarget) {
                const link = new vscode.DocumentLink(range, vscode.Uri.file(formTarget));
                link.tooltip = `Abrir formulário ${formName}`;
                links.push(link);
            } else {
                const link = new vscode.DocumentLink(range);
                link.tooltip = `Formulário "${formName}" não encontrado no workspace`;
                links.push(link);
            }
        }

        return links;
    }
}

function resolveFormPath(baseDir: string, formName: string): string | undefined {
    let dir = baseDir;
    for (let i = 0; i < 5; i++) {
        const candidates = [
            join(dir, 'forms', formName),
            join(dir, 'forms', `${formName}.form`),
            join(dir, `${formName}.form`),
        ];
        for (const c of candidates) {
            if (existsSync(c)) { return c; }
        }
        const parent = dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return undefined;
}
