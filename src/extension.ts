import { ExtensionContext, Uri, workspace, window, ConfigurationTarget } from 'vscode';
import * as vscode from 'vscode';
import { basename } from 'path';
import { setBrowserPathProvider, setSdkLoggers } from '@fluiggers/sdk';
import { TemplateService } from './core/template.service';
import { registerLibraryCommands } from './core/commands/library.commands';
import { registerDatasetCommands } from './core/commands/dataset.commands';
import { registerFormCommands } from './core/commands/form.commands';
import { registerWidgetCommands } from './core/commands/widget.commands';
import { registerWorkflowCommands } from './core/commands/workflow.commands';
import { registerGlobalEventCommands } from './core/commands/global-event.commands';
import { registerServerCommands } from './core/commands/server.commands';
import { registerWatchMode } from './core/watch';
import { registerStatusBar } from './core/status-bar';
import { registerProcessCommands } from './core/commands/process.commands';
import { SyncDecorationProvider } from './core/file-decoration';
import { FluigRemoteContentProvider, REMOTE_SCHEME, registerContentFetcher } from './core/diff-provider';
import { getDatasetContent } from './fluig/datasets/dataset.service';
import { getGlobalEventContent } from './fluig/events/global-event.service';
import { getMechanismContent } from './fluig/workflow/workflow.service';
import { registerRuntimeCommands } from './core/commands/runtime.commands';
import { RuntimeState, initRuntime } from './core/runtime-state';
import { createLogger, initLogger, disposeLogger } from './core/logger';
import { onArtifactSuccess, onArtifactError, disposeEventBus } from './core/event-bus';
import { pushDeployRecord } from './core/deploy-history';

export async function activate(context: ExtensionContext): Promise<void> {
    const runtime = new RuntimeState();
    initRuntime(runtime);
    initLogger();

    const syncLog = createLogger('[SYNC]');
    setSdkLoggers(createLogger('[AUTH]'), createLogger('[HTTP]'));

    registerContentFetcher('dataset', (name, server) => getDatasetContent(server, name));
    registerContentFetcher('global-event', (name, server) => getGlobalEventContent(server, name));
    registerContentFetcher('mechanism', (name, server) => getMechanismContent(server, name));

    if (!workspace.workspaceFolders) {
        window.showWarningMessage(
            'A extensão Fluiggers requer uma pasta ou Workspace aberto para funcionar.'
        );
        return;
    }

    setBrowserPathProvider(async () => {
        const config = workspace.getConfiguration('fluiggers');
        let customPath = config.get<string>('browserPath', '');
        if (customPath) {
            return customPath;
        }
        const fileUri = await window.showOpenDialog({
            canSelectMany: false,
            title: 'Selecione o executável do seu navegador para efetuar o Login',
            openLabel: 'Selecionar',
            filters: { Executables: ['exe', 'app', 'bin', 'sh'] },
        });
        if (fileUri?.[0]) {
            customPath = fileUri[0].fsPath;
            await config.update('browserPath', customPath, ConfigurationTarget.Global);
            return customPath;
        }
        window.showErrorMessage('Preencha o caminho até o seu navegador nas configurações da Extensão Fluiggers!');
        return '';
    });

    const templatesUri = Uri.joinPath(context.extensionUri, 'dist', 'templates');
    TemplateService.templatesUri = templatesUri;
    TemplateService.formEventsUri = Uri.joinPath(templatesUri, 'formEvents');
    TemplateService.workflowEventsUri = Uri.joinPath(templatesUri, 'workflowEvents');
    TemplateService.globalEventsUri = Uri.joinPath(templatesUri, 'globalEvents');
    TemplateService.formEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.formEventsUri);
    TemplateService.workflowEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.workflowEventsUri);
    TemplateService.globalEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.globalEventsUri);

    context.subscriptions.push(
        runtime,

        vscode.window.registerFileDecorationProvider(new SyncDecorationProvider()),
        vscode.workspace.registerTextDocumentContentProvider(REMOTE_SCHEME, new FluigRemoteContentProvider()),

        // Sync-state listener (file decorations driven by markSynced/markError)
        runtime.onDidChangeSyncState(uri => {
            const status = runtime.getStatus(uri);
            const name = basename(uri.fsPath);
            if (status === 'synced') {
                syncLog.success(`Sincronizado: ${name}`);
            } else if (status === 'error') {
                syncLog.error(`Falha ao exportar: ${name}`);
            }
        }),

        // Domain event bus — single place that reacts to artifact operations
        onArtifactSuccess(e => {
            const verb = e.operation === 'export' ? 'Exportado' : 'Importado';
            syncLog.success(`${verb}: ${e.name} → ${e.serverName}`);
            if (e.uri) { runtime.markSynced(e.uri); }
            if (!e.silent) {
                window.showInformationMessage(`${e.name} ${verb.toLowerCase()} com sucesso!`);
            }
            if (e.operation === 'export') {
                pushDeployRecord({
                    timestamp: new Date(),
                    artifactName: e.name,
                    kind: e.kind,
                    serverName: e.serverName,
                    status: 'success',
                    fsPath: e.uri?.fsPath,
                });
            }
        }),
        onArtifactError(e => {
            const verb = e.operation === 'export' ? 'exportar' : 'importar';
            syncLog.error(`Falha ao ${verb}: ${e.name} — ${e.error}`);
            if (e.uri) { runtime.markError(e.uri); }
            if (!e.silent) {
                window.showErrorMessage(`Falha ao ${verb} ${e.name}: ${e.error}`);
            }
            if (e.operation === 'export') {
                pushDeployRecord({
                    timestamp: new Date(),
                    artifactName: e.name,
                    kind: e.kind,
                    serverName: e.serverName,
                    status: 'error',
                    fsPath: e.uri?.fsPath,
                    error: e.error,
                });
            }
        }),

        { dispose: disposeLogger },
        { dispose: disposeEventBus },
    );

    registerLibraryCommands(context);
    registerDatasetCommands(context);
    registerFormCommands(context);
    registerWidgetCommands(context);
    registerWorkflowCommands(context);
    registerGlobalEventCommands(context);
    await registerServerCommands(context);
    registerWatchMode(context);
    registerStatusBar(context);
    registerProcessCommands(context);
    registerRuntimeCommands(context);
}

export function deactivate(): void {}
