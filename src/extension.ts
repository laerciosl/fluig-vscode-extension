import { ExtensionContext, Uri, workspace } from 'vscode';
import { TemplateService } from './core/template.service';
import { registerLibraryCommands } from './core/commands/library.commands';
import { registerDatasetCommands } from './core/commands/dataset.commands';
import { registerFormCommands } from './core/commands/form.commands';
import { registerWidgetCommands } from './core/commands/widget.commands';
import { registerWorkflowCommands } from './core/commands/workflow.commands';
import { registerGlobalEventCommands } from './core/commands/global-event.commands';
import { registerServerCommands } from './core/commands/server.commands';
import { registerWatchMode } from './core/watch';

export async function activate(context: ExtensionContext): Promise<void> {
    if (!workspace.workspaceFolders) {
        throw new Error('É necessário estar em Workspace / Diretório.');
    }

    const templatesUri = Uri.joinPath(context.extensionUri, 'dist', 'templates');
    TemplateService.templatesUri = templatesUri;
    TemplateService.formEventsUri = Uri.joinPath(templatesUri, 'formEvents');
    TemplateService.workflowEventsUri = Uri.joinPath(templatesUri, 'workflowEvents');
    TemplateService.globalEventsUri = Uri.joinPath(templatesUri, 'globalEvents');
    TemplateService.formEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.formEventsUri);
    TemplateService.workflowEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.workflowEventsUri);
    TemplateService.globalEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.globalEventsUri);

    registerLibraryCommands(context);
    registerDatasetCommands(context);
    registerFormCommands(context);
    registerWidgetCommands(context);
    registerWorkflowCommands(context);
    registerGlobalEventCommands(context);
    await registerServerCommands(context);
    registerWatchMode(context);
}

export function deactivate(): void {}
