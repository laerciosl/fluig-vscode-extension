import * as vscode from 'vscode';
import { ProcessHoverProvider } from '../providers/process.hover-provider';
import { ProcessCodeLensProvider } from '../providers/process.codelens-provider';
import { ProcessLinkProvider } from '../providers/process.link-provider';
import { ProcessDefinitionProvider } from '../providers/process.definition-provider';
import { registerProcessDiagnostics } from '../providers/process.diagnostics';
import { getProcessDefinition, clearProcessCache } from '../../fluig/workflow/process/process.cache';
import { createLogger } from '../logger';
import { validateProcessDefinition } from '../../fluig/workflow/process/process.validator';
import { openWorkflowPreview, disposeAllPreviews, initWorkflowPreview } from '../views/workflow-preview.webview';
import { openDiffPanel, disposeAllDiffPanels } from '../views/process-diff.webview';
import { diffProcess } from '../../fluig/workflow/process/process.diff';
import { parseProcess } from '../../fluig/workflow/process/process.parser';
import { createMinimalProcessXml } from '../../fluig/workflow/process/process.factory';
import { execFile } from 'child_process';
import { relative, join } from 'path';

const PROCESS_SELECTOR: vscode.DocumentSelector = { language: 'fluig-process', scheme: 'file' };

const log = createLogger('[PROCESS]');

export function registerProcessCommands(context: vscode.ExtensionContext): void {
    initWorkflowPreview(context.extensionUri);

    const codeLensProvider = new ProcessCodeLensProvider();

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(PROCESS_SELECTOR, new ProcessHoverProvider()),
        vscode.languages.registerCodeLensProvider(PROCESS_SELECTOR, codeLensProvider),
        vscode.languages.registerDocumentLinkProvider(PROCESS_SELECTOR, new ProcessLinkProvider()),
        vscode.languages.registerDefinitionProvider(PROCESS_SELECTOR, new ProcessDefinitionProvider()),
        { dispose: () => codeLensProvider.dispose() },
        { dispose: () => clearProcessCache() },
        { dispose: () => disposeAllPreviews() },
        { dispose: () => disposeAllDiffPanels() },
    );

    registerProcessDiagnostics(context);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.previewProcess',
            (uri?: vscode.Uri) => previewProcess(uri)
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.validateProcess',
            (uri?: vscode.Uri) => validateProcess(uri)
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.diffProcessWithGit',
            (uri?: vscode.Uri) => diffProcessWithGit(uri)
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.createProcess',
            () => createProcess()
        ),
    );
}

// ── Preview ───────────────────────────────────────────────────────────────

async function previewProcess(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
        vscode.window.showWarningMessage('Abra um arquivo .process para visualizar.');
        return;
    }
    openWorkflowPreview(target);
    log.info(`Preview aberto: ${target.fsPath}`);
}

// ── Validação inicial (precursor da Fase 6) ───────────────────────────────

async function validateProcess(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
        vscode.window.showWarningMessage('Abra um arquivo .process para validar.');
        return;
    }

    const document = await vscode.workspace.openTextDocument(target);
    const def = getProcessDefinition(document);
    if (!def) {
        vscode.window.showErrorMessage('Arquivo .process inválido — não foi possível parsear.');
        return;
    }

    const issues = validateProcessDefinition(def, { processFsPath: target.fsPath });
    const severityIcon: Record<string, string> = { error: '✗', warning: '⚠', info: 'ℹ' };

    log.info(`Validação de ${def.metadata.id}: ${issues.length} problema(s) encontrado(s).`);
    for (const issue of issues) {
        log.info(`  ${severityIcon[issue.severity] ?? '•'} [${issue.code}] ${issue.message}`);
    }

    if (issues.length === 0) {
        vscode.window.showInformationMessage(
            `✓ Validação OK: ${def.activities.length} atividades, ${def.transitions.length} flows, sem problemas detectados.`
        );
        return;
    }

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;

    const action = await vscode.window.showWarningMessage(
        `${issues.length} problema(s) em "${def.metadata.name || def.metadata.id}": ${errors} erro(s), ${warnings} aviso(s).`,
        'Ver detalhes'
    );
    if (action === 'Ver detalhes') {
        await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
    }
}

// ── Diff semântico com Git ────────────────────────────────────────────────

async function diffProcessWithGit(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
        vscode.window.showWarningMessage('Abra um arquivo .process para comparar.');
        return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(target);
    if (!folder) {
        vscode.window.showErrorMessage('Arquivo fora do workspace — diff git não disponível.');
        return;
    }

    const relPath = relative(folder.uri.fsPath, target.fsPath).replace(/\\/g, '/');

    let headXml: string;
    try {
        headXml = await runGitShow(folder.uri.fsPath, relPath);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Não foi possível ler do git: ${msg}`);
        return;
    }

    const currentDocument = await vscode.workspace.openTextDocument(target);
    const currentXml = currentDocument.getText();

    let beforeDef, afterDef;
    try {
        beforeDef = parseProcess(headXml);
        afterDef = parseProcess(currentXml);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Falha ao parsear .process: ${msg}`);
        return;
    }

    const diff = diffProcess(beforeDef, afterDef);
    log.info(
        `Diff vs HEAD para ${afterDef.metadata.id}: ${diff.changes.length} mudança(s).`
    );

    openDiffPanel(
        target,
        'HEAD',
        'working tree',
        beforeDef,
        afterDef,
        diff.changes
    );
}

// ── Criar novo processo ───────────────────────────────────────────────────

async function createProcess(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        vscode.window.showErrorMessage('Abra um workspace para criar um processo.');
        return;
    }

    const id = await vscode.window.showInputBox({
        title: 'Novo Processo Fluig — ID',
        prompt: 'Identificador do processo (letras, números, _ e -)',
        validateInput: v => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v ?? '')
            ? undefined
            : 'Use apenas letras, números, _ ou - e inicie com letra.',
    });
    if (!id) { return; }

    const name = await vscode.window.showInputBox({
        title: 'Novo Processo Fluig — Nome',
        prompt: 'Nome de exibição do processo',
        value: id,
    });
    if (!name) { return; }

    const swimlaneName = await vscode.window.showInputBox({
        title: 'Novo Processo Fluig — Swimlane',
        prompt: 'Nome da swimlane inicial (deixe em branco para "Geral")',
        value: '',
    });
    if (swimlaneName === undefined) { return; }

    const diagDir = vscode.Uri.file(join(folder.uri.fsPath, 'workflow', 'diagrams'));
    try {
        await vscode.workspace.fs.createDirectory(diagDir);
    } catch {
        // Diretório já existe — ok
    }

    const target = vscode.Uri.file(join(diagDir.fsPath, `${id}.process`));
    try {
        await vscode.workspace.fs.stat(target);
        const overwrite = await vscode.window.showWarningMessage(
            `O arquivo "${id}.process" já existe. Deseja substituí-lo?`,
            { modal: true }, 'Substituir'
        );
        if (overwrite !== 'Substituir') { return; }
    } catch {
        // Arquivo não existe — ok criar
    }

    try {
        const xml = createMinimalProcessXml({ id, name, swimlaneName: swimlaneName || undefined });
        await vscode.workspace.fs.writeFile(target, Buffer.from(xml, 'utf-8'));
        log.info(`Processo criado: ${target.fsPath}`);
        openWorkflowPreview(target);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Erro ao criar processo: ${err.message}`);
    }
}

function runGitShow(cwd: string, relativePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile('git', ['show', `HEAD:${relativePath}`], { cwd, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(stderr?.toString().trim() || err.message));
                return;
            }
            resolve(stdout.toString());
        });
    });
}
