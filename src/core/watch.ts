import * as vscode from 'vscode';
import { basename, dirname } from 'path';
import { exportOne as exportDataset } from '../fluig/datasets/dataset.service';
import { exportOne as exportForm } from '../fluig/forms/form.service';
import { exportOne as exportGlobalEvent } from '../fluig/events/global-event.service';
import { updateWorkflowEvents, exportMechanism } from '../fluig/workflow/workflow.service';
import { exportWidget } from '../fluig/widgets/widget.service';
import { parseProcess } from '../fluig/workflow/process/process.parser';
import { validateProcessDefinition } from '../fluig/workflow/process/process.validator';
import { pushDeployRecord } from './deploy-history';
import { getRuntime } from './runtime-state';
import { createLogger } from './logger';

const watchLog = createLogger('[WATCH]');
const deployLog = createLogger('[DEPLOY]');

const CONFIG_KEY = 'autoExportOnSave';
export const DEBOUNCE_MS = 500;
const MAX_RETRIES = 2;

export type ExportType = 'dataset' | 'form' | 'globalEvent' | 'workflow' | 'mechanism' | 'widget';

export function resolveExportType(filePath: string): ExportType | null {
    if (/[/\\]datasets[/\\].+$/.test(filePath))                  return 'dataset';
    if (/[/\\]forms[/\\].+$/.test(filePath))                     return 'form';       // antes de events
    if (/[/\\]events[/\\].+$/.test(filePath))                    return 'globalEvent';
    if (/[/\\]workflow[/\\]scripts[/\\].+\.js$/.test(filePath))  return 'workflow';
    if (/[/\\]mechanisms[/\\].+$/.test(filePath))                return 'mechanism';
    if (/[/\\]widget[/\\].+$/.test(filePath))                    return 'widget';
    return null;
}

function isEnabled(): boolean {
    return vscode.workspace.getConfiguration('fluiggers').get<boolean>(CONFIG_KEY, false);
}

async function resolveExport(fileUri: vscode.Uri, context: vscode.ExtensionContext): Promise<void> {
    switch (resolveExportType(fileUri.path)) {
        case 'dataset':     await exportDataset(fileUri); break;
        case 'globalEvent': await exportGlobalEvent(fileUri); break;
        case 'workflow':    await updateWorkflowEvents(fileUri); break;
        case 'mechanism':   await exportMechanism(fileUri); break;
        case 'form':        await exportForm(context, fileUri); break;
        case 'widget':      await exportWidget(fileUri); break;
    }
}

function scheduleExport(fileUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const name = basename(fileUri.fsPath);
    const exportType = resolveExportType(fileUri.path);
    watchLog.debug(`Agendando exportação: ${name}`);
    getRuntime().deployQueue.enqueue(
        fileUri.fsPath,
        async () => {
            if (exportType === 'workflow' && !(await guardWorkflowDeploy(fileUri))) {
                pushDeployRecord({
                    timestamp: new Date(),
                    artifactName: name,
                    kind: 'workflow',
                    serverName: getRuntime().activeServer?.name ?? '—',
                    status: 'blocked',
                    fsPath: fileUri.fsPath,
                });
                return;
            }
            watchLog.info(`Exportando: ${name}`);
            await resolveExport(fileUri, context);
        },
        {
            debounceMs: DEBOUNCE_MS,
            maxRetries: MAX_RETRIES,
            onRetry: (attempt, err) => {
                const msg = err instanceof Error ? err.message : String(err);
                deployLog.info(`Retry ${attempt}/${MAX_RETRIES}: ${name} — ${msg}`);
            },
        }
    );
}

/**
 * Antes de exportar um script de workflow, valida o `.process` correspondente.
 * Scripts ficam em `workflow/scripts/`; o `.process` fica em `workflow/`.
 * Retorna `false` (bloqueia deploy) se houver issues de severidade `error`.
 */
async function guardWorkflowDeploy(scriptUri: vscode.Uri): Promise<boolean> {
    const workflowDir = vscode.Uri.file(dirname(dirname(scriptUri.fsPath)));
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(workflowDir);
    } catch {
        return true;
    }

    const processFiles = entries.filter(([n]) => n.endsWith('.process'));
    if (processFiles.length === 0) {
        return true;
    }

    for (const [fileName] of processFiles) {
        const processUri = vscode.Uri.joinPath(workflowDir, fileName);
        let xml: string;
        try {
            xml = Buffer.from(await vscode.workspace.fs.readFile(processUri)).toString('utf-8');
        } catch {
            continue;
        }

        let def;
        try {
            def = parseProcess(xml);
        } catch {
            continue;
        }

        const issues = validateProcessDefinition(def, { processFsPath: processUri.fsPath });
        const errors = issues.filter(i => i.severity === 'error');

        if (errors.length > 0) {
            deployLog.error(`Deploy bloqueado: ${fileName} tem ${errors.length} erro(s) de validação.`);
            for (const e of errors) {
                deployLog.error(`  ✗ [${e.code}] ${e.message}`);
            }
            vscode.window.showWarningMessage(
                `Deploy bloqueado: "${fileName}" tem ${errors.length} erro(s). Corrija antes de exportar.`,
                'Ver Problemas'
            ).then(action => {
                if (action === 'Ver Problemas') {
                    vscode.commands.executeCommand('workbench.actions.view.problems');
                }
            });
            return false;
        }

        const warnings = issues.filter(i => i.severity === 'warning');
        if (warnings.length > 0) {
            deployLog.info(`${fileName}: ${warnings.length} aviso(s) de validação — deploy prosseguindo.`);
        }
    }

    return true;
}

export function registerWatchMode(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.toggleAutoExport',
            async () => {
                const config = vscode.workspace.getConfiguration('fluiggers');
                await config.update(CONFIG_KEY, !isEnabled(), vscode.ConfigurationTarget.Workspace);
            }
        ),
        vscode.workspace.onDidSaveTextDocument(document => {
            getRuntime().checkModified(document.uri);
            if (!isEnabled()) {
                return;
            }
            scheduleExport(document.uri, context);
        })
    );
}
