import * as vscode from 'vscode';
import { getProcessDefinition } from '../../fluig/workflow/process/process.cache';
import {
    validateProcessDefinition,
    ValidationIssue,
} from '../../fluig/workflow/process/process.validator';

/**
 * Conecta a validação ao painel "Problems" do VS Code via `DiagnosticCollection`.
 *
 * Reavalia em abrir, alterar e salvar arquivos `.process` no workspace.
 */
export function registerProcessDiagnostics(
    context: vscode.ExtensionContext
): vscode.DiagnosticCollection {
    const collection = vscode.languages.createDiagnosticCollection('fluig-process');
    context.subscriptions.push(collection);

    const refresh = (document: vscode.TextDocument): void => {
        if (document.languageId !== 'fluig-process') {
            return;
        }
        collection.set(document.uri, buildDiagnostics(document));
    };

    // Inicialização: arquivos já abertos no startup.
    for (const editor of vscode.window.visibleTextEditors) {
        refresh(editor.document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(refresh),
        vscode.workspace.onDidChangeTextDocument(e => refresh(e.document)),
        vscode.workspace.onDidSaveTextDocument(refresh),
        vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
    );

    return collection;
}

function buildDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
    const def = getProcessDefinition(document);
    if (!def) {
        return [];
    }
    const issues = validateProcessDefinition(def, { processFsPath: document.uri.fsPath });
    return issues.map(issue => issueToDiagnostic(document, issue));
}

function issueToDiagnostic(
    document: vscode.TextDocument,
    issue: ValidationIssue
): vscode.Diagnostic {
    const range = locateRange(document, issue.targetId);
    const diagnostic = new vscode.Diagnostic(range, issue.message, severityFor(issue.severity));
    diagnostic.code = issue.code;
    diagnostic.source = 'fluig';
    return diagnostic;
}

function severityFor(severity: ValidationIssue['severity']): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error': return vscode.DiagnosticSeverity.Error;
        case 'warning': return vscode.DiagnosticSeverity.Warning;
        case 'info': return vscode.DiagnosticSeverity.Information;
    }
}

/**
 * Localiza o `id="<targetId>"` no texto para apontar o diagnostic à linha
 * correta. Quando `targetId` é `undefined` (regras de processo todo)
 * aponta para o início do arquivo.
 */
function locateRange(document: vscode.TextDocument, targetId?: string): vscode.Range {
    if (!targetId) {
        return new vscode.Range(0, 0, 0, 0);
    }
    const idx = document.getText().indexOf(`id="${targetId}"`);
    if (idx === -1) {
        return new vscode.Range(0, 0, 0, 0);
    }
    const start = document.positionAt(idx);
    const end = document.positionAt(idx + `id="${targetId}"`.length);
    return new vscode.Range(start, end);
}
