import { ExtensionContext, commands, Uri } from 'vscode';
import { runDatasetLocally } from '../../fluig/runtime/runtime.service';

export function registerRuntimeCommands(context: ExtensionContext): void {
    context.subscriptions.push(
        commands.registerCommand(
            'fluiggers-fluig-vscode-extension.runDatasetLocally',
            (fileUri: Uri) => runDatasetLocally(fileUri)
        )
    );
}
