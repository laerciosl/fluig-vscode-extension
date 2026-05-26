import * as vscode from 'vscode';
import {
    ServerItem,
    DomainGroupItem,
    ArtifactItem,
    ServerItemProvider,
} from '../providers/server-item.provider';
import { checkServerConfigVersion } from '../server.service';

export async function registerServerCommands(context: vscode.ExtensionContext): Promise<void> {
    if (!(await checkServerConfigVersion())) {
        throw new Error('Erro na versão do arquivo de configuração.');
    }

    const serverItemProvider = new ServerItemProvider(context);
    vscode.window.registerTreeDataProvider(
        'fluiggers-fluig-vscode-extension.servers',
        serverItemProvider
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.addServer',
            () => serverItemProvider.add()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.changeServerConfigPath',
            () => serverItemProvider.changeConfigPath()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.refreshServer',
            () => serverItemProvider.refresh()
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.editServer',
            (serverItem: ServerItem) => serverItemProvider.update(serverItem)
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.deleteServer',
            (serverItem: ServerItem) => serverItemProvider.delete(serverItem)
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.refreshDomainGroup',
            (item: DomainGroupItem) => serverItemProvider.refresh(item)
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.datasetView',
            (item: DomainGroupItem | ArtifactItem) => serverItemProvider.queryDataset(item)
        )
    );
}
