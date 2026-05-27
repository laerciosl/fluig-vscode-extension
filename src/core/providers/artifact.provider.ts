import * as vscode from 'vscode';
import { Server } from '../server.model';
import { findByName, getSelectedServerName, onDidSelectServer } from '../server.service';

type ProviderState<T> =
    | { tag: 'disconnected' }
    | { tag: 'loading' }
    | { tag: 'ready'; items: T[] }
    | { tag: 'error'; message: string };

export abstract class FluigArtifactProvider<T> implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onChange.event;

    private state: ProviderState<T> = { tag: 'disconnected' };

    constructor() {
        onDidSelectServer(name => {
            if (!name) {
                this.state = { tag: 'disconnected' };
                this._onChange.fire();
            } else {
                void this.reload();
            }
        });
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (element) {
            return [];
        }
        return this.buildRootItems();
    }

    refresh(): void {
        void this.reload();
    }

    currentServer(): Server | undefined {
        const name = getSelectedServerName();
        if (!name) {
            return undefined;
        }
        const dto = findByName(name);
        return dto ? new Server(dto) : undefined;
    }

    protected abstract loadItems(server: Server): Promise<T[]>;
    protected abstract toTreeItem(item: T): vscode.TreeItem;

    private async reload(): Promise<void> {
        const server = this.currentServer();
        if (!server) {
            this.state = { tag: 'disconnected' };
            this._onChange.fire();
            return;
        }

        this.state = { tag: 'loading' };
        this._onChange.fire();

        try {
            const items = await this.loadItems(server);
            this.state = { tag: 'ready', items };
        } catch (e: any) {
            this.state = { tag: 'error', message: e?.message || String(e) };
        }
        this._onChange.fire();
    }

    private buildRootItems(): vscode.TreeItem[] {
        switch (this.state.tag) {
            case 'disconnected':
                return [statusItem('Conecte a um servidor', 'plug')];
            case 'loading':
                return [statusItem('Carregando...', 'loading~spin')];
            case 'error':
                return [errorItem(this.state.message)];
            case 'ready':
                if (!this.state.items.length) {
                    return [statusItem('Nenhum item encontrado', 'info')];
                }
                return this.state.items.map(item => this.toTreeItem(item));
        }
    }
}

function statusItem(label: string, icon: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
}

function errorItem(message: string): vscode.TreeItem {
    const item = new vscode.TreeItem('Erro ao carregar — clique para detalhes', vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('error');
    item.tooltip = message;
    item.contextValue = 'providerError';
    return item;
}
