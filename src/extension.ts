import { ExtensionContext, Uri, workspace, window, ConfigurationTarget } from 'vscode';
import * as vscode from 'vscode';
import { basename } from 'path';
import { setBrowserPathProvider } from '@fluiggers/sdk';
import { TemplateService } from './core/template.service';
import { registerLibraryCommands } from './core/commands/library.commands';
import { registerDatasetCommands } from './core/commands/dataset.commands';
import { registerFormCommands } from './core/commands/form.commands';
import { registerWidgetCommands } from './core/commands/widget.commands';
import { registerWorkflowCommands } from './core/commands/workflow.commands';
import { registerGlobalEventCommands } from './core/commands/global-event.commands';
import { registerServerCommands } from './core/commands/server.commands';
import { registerWatchMode } from './core/watch';
import { SyncDecorationProvider } from './core/file-decoration';
import { registerRuntimeCommands } from './core/commands/runtime.commands';
import { onDidChangeSyncState, getStatus } from './core/sync-state';
import { logSuccess, logError, disposeOutput } from './core/output';

export async function activate(context: ExtensionContext): Promise<void> {
    if (!workspace.workspaceFolders) {
        throw new Error('É necessário estar em Workspace / Diretório.');
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
        vscode.window.registerFileDecorationProvider(new SyncDecorationProvider()),
        onDidChangeSyncState(uri => {
            const status = getStatus(uri);
            const name = basename(uri.fsPath);
            if (status === 'synced') {
                logSuccess(`Sincronizado: ${name}`);
            } else if (status === 'error') {
                logError(`Falha ao exportar: ${name}`);
            }
        }),
        { dispose: disposeOutput }
    );

    registerLibraryCommands(context);
    registerDatasetCommands(context);
    registerFormCommands(context);
    registerWidgetCommands(context);
    registerWorkflowCommands(context);
    registerGlobalEventCommands(context);
    await registerServerCommands(context);
    registerWatchMode(context);
    registerRuntimeCommands(context);
}

export function deactivate(): void {}
