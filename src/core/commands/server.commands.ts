import * as vscode from 'vscode';
import {
    ServerItem,
    DomainGroupItem,
    ArtifactItem,
    ServerItemProvider,
} from '../providers/server-item.provider';
import { checkServerConfigVersion, setSelectedServer, clearSelectedServer } from '../server.service';
import { logInfo } from '../output';

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
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.connectServer',
            (serverItem: ServerItem) => {
                setSelectedServer(serverItem.server.name);
                logInfo(`● Conectado ao servidor: ${serverItem.server.name}`);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.disconnectServer',
            (serverItem: ServerItem) => {
                clearSelectedServer();
                logInfo(`○ Desconectado do servidor: ${serverItem.server.name}`);
            }
        )
    );
}
