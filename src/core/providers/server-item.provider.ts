import * as vscode from 'vscode';
import * as fs from 'fs';
import { ServerDTO } from '../../types/server.types';
import { Server } from '../server.model';
import { getServerConfig, getFileServerConfig, updateConfigPath } from '../server.service';
import { ServerView } from '../views/server.view';
import { DatasetView } from '../views/dataset.view';

export class ServerItem extends vscode.TreeItem {
    constructor(
        public context: vscode.ExtensionContext,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public server: ServerDTO
    ) {
        super(label, collapsibleState);
    }

    iconPath = {
        light: vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'images', 'light', 'server-environment.svg'),
        dark: vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'images', 'dark', 'server-environment.svg'),
    };

    contextValue = 'serverItem';
}

export class DatasetItem extends ServerItem {
    iconPath = {
        light: vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'images', 'light', 'database.svg'),
        dark: vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'images', 'dark', 'database.svg'),
    };

    contextValue = 'DatasetItem';
}

export class ServerItemProvider implements vscode.TreeDataProvider<ServerItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ServerItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public serverItems: ServerItem[] = [];

    constructor(public context: vscode.ExtensionContext) {
        this.watchConfigFile();
    }

    public getTreeItem(element: ServerItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ServerItem): vscode.ProviderResult<ServerItem[]> {
        if (element) {
            return Promise.resolve([
                new DatasetItem(
                    this.context,
                    'Dataset',
                    vscode.TreeItemCollapsibleState.None,
                    element.server
                ),
            ]);
        }
        return Promise.resolve(this.serverItems);
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public add(): void {
        new ServerView(this.context).show();
    }

    public async changeConfigPath(): Promise<void> {
        const config = vscode.workspace.getConfiguration('fluiggers');
        let customPath = config.get<string>('serverConfigPath', '');

        const fileUri = await vscode.window.showSaveDialog({
            title: 'Arquivo de Configuração de Servidores (não será sobreescrito)',
            saveLabel: 'Selecione',
            defaultUri: customPath.length ? vscode.Uri.file(customPath) : undefined,
            filters: { JSON: ['json'] },
        });

        if (fileUri) {
            customPath = fileUri.fsPath;
        } else {
            customPath = '';
            vscode.window.showInformationMessage(
                'Caminho do arquivo de configuração será na pasta .vscode'
            );
        }

        await config.update('serverConfigPath', customPath, vscode.ConfigurationTarget.Global);

        updateConfigPath();
        this.watchConfigFile();
        this.refresh();
    }

    public delete(serverItem: ServerItem): void {
        vscode.window
            .showInformationMessage(
                `Deseja excluir o servidor ${serverItem.server.name}?`,
                'Sim',
                'Não'
            )
            .then(selection => {
                if (selection === 'Sim') {
                    const index = this.serverItems.indexOf(serverItem);
                    if (index < 0 || !serverItem?.server?.id) {
                        return;
                    }

                    const { remove } = require('../server.service');
                    remove(serverItem.server.id);
                }
            });
    }

    public update(serverItem: ServerItem): void {
        const view = new ServerView(this.context);
        view.setServerData(new Server(serverItem.server));
        view.show();
    }

    public datasetView(datasetItem: DatasetItem): void {
        new DatasetView(this.context, new Server(datasetItem.server)).show();
    }

    private buildServerItems(): ServerItem[] {
        const serverConfig = getServerConfig();

        return serverConfig.configurations
            .map(
                (element: ServerDTO) =>
                    new ServerItem(
                        this.context,
                        element.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element
                    )
            )
            .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    }

    private watchConfigFile(): void {
        const fileServer = getFileServerConfig();
        this.serverItems = this.buildServerItems();

        fs.watch(fileServer, { encoding: 'buffer' }, (eventType, filename) => {
            if (filename && eventType === 'change') {
                this.serverItems = this.buildServerItems();
                this.refresh();
            }
        });
    }
}
