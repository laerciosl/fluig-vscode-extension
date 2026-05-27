import * as vscode from 'vscode';
import {
    ServerItem,
    DomainGroupItem,
    ArtifactItem,
    ServerItemProvider,
} from '../providers/server-item.provider';
import { checkServerConfigVersion } from '../server.service';
import { Server } from '../server.model';
import { getRuntime } from '../runtime-state';
import { createLogger } from '../logger';

const log = createLogger('[SERVER]');
import { testConnection } from '../../fluig/health/health.service';

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
                getRuntime().selectServer(new Server(serverItem.server));
                log.info(`● Conectado ao servidor: ${serverItem.server.name}`);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.disconnectServer',
            (serverItem: ServerItem) => {
                getRuntime().deselectServer();
                log.info(`○ Desconectado do servidor: ${serverItem.server.name}`);
            }
        ),
        vscode.commands.registerCommand(
            'fluiggers-fluig-vscode-extension.testConnection',
            (serverItem?: ServerItem) => testConnection(serverItem?.server)
        )
    );
}
