import * as vscode from 'vscode';
import * as fs from 'fs';
import { ServerDTO } from '../../types/server.types';
import { Server } from '../server.model';
import { getServerConfig, getFileServerConfig, updateConfigPath, onDidSelectServer, getSelectedServerName } from '../server.service';
import { ServerView } from '../views/server.view';
import { DatasetView } from '../views/dataset.view';
import { getCustomDatasets } from '../../fluig/datasets/dataset.service';
import { getForms } from '../../fluig/forms/form.service';
import { getMechanisms } from '../../fluig/workflow/workflow.service';
import { getWidgets } from '../../fluig/widgets/widget.service';
import { DatasetDTO } from '../../fluig/datasets/dataset.types';
import { DocumentDTO } from '../../fluig/forms/form.types';
import { AttributionMechanismDTO } from '../../fluig/workflow/workflow.types';
import { WidgetFluiggersDTO } from '../../fluig/widgets/widget.types';

export type DomainType = 'dataset' | 'form' | 'mechanism' | 'widget';

type ArtifactDTO = DatasetDTO | DocumentDTO | AttributionMechanismDTO | WidgetFluiggersDTO;

const DOMAIN_LABELS: Record<DomainType, string> = {
    dataset: 'Datasets',
    form: 'Formulários',
    mechanism: 'Mecanismos',
    widget: 'Widgets',
};

const DOMAIN_ICONS: Record<DomainType, string> = {
    dataset: 'database',
    form: 'symbol-file',
    mechanism: 'settings-gear',
    widget: 'extensions',
};

type TreeNode = ServerItem | DomainGroupItem | ArtifactItem | vscode.TreeItem;

// ── Tree item classes ────────────────────────────────────────────────────────

export class ServerItem extends vscode.TreeItem {
    constructor(
        public context: vscode.ExtensionContext,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public server: ServerDTO,
        isConnected = false
    ) {
        super(label, collapsibleState);

        this.contextValue = isConnected ? 'serverItemConnected' : 'serverItemDisconnected';

        if (isConnected) {
            this.description = '● conectado';
            this.tooltip = `${label} — servidor ativo`;
            this.iconPath = new vscode.ThemeIcon(
                'circle-filled',
                new vscode.ThemeColor('testing.iconPassed')
            );
        } else {
            this.iconPath = {
                light: vscode.Uri.joinPath(context.extensionUri, 'dist', 'images', 'light', 'server-environment.svg'),
                dark: vscode.Uri.joinPath(context.extensionUri, 'dist', 'images', 'dark', 'server-environment.svg'),
            };
        }
    }
}

export class DomainGroupItem extends vscode.TreeItem {
    constructor(
        public readonly domain: DomainType,
        public readonly server: ServerDTO,
        public readonly context: vscode.ExtensionContext
    ) {
        super(DOMAIN_LABELS[domain], vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon(DOMAIN_ICONS[domain]);
        this.contextValue = `${domain}Group`;
    }
}

export class ArtifactItem extends vscode.TreeItem {
    constructor(
        public readonly domain: DomainType,
        public readonly server: ServerDTO,
        public readonly artifact: ArtifactDTO
    ) {
        super(ArtifactItem.resolveLabel(domain, artifact), vscode.TreeItemCollapsibleState.None);
        this.description = ArtifactItem.resolveDescription(domain, artifact);
        this.iconPath = new vscode.ThemeIcon(DOMAIN_ICONS[domain]);
        this.contextValue = `${domain}Artifact`;
    }

    private static resolveLabel(domain: DomainType, artifact: ArtifactDTO): string {
        switch (domain) {
            case 'dataset': return (artifact as DatasetDTO).datasetId;
            case 'form': return (artifact as DocumentDTO).documentDescription;
            case 'mechanism': return (artifact as AttributionMechanismDTO).attributionMecanismDescription || (artifact as AttributionMechanismDTO).name;
            case 'widget': return (artifact as WidgetFluiggersDTO).title;
        }
    }

    private static resolveDescription(domain: DomainType, artifact: ArtifactDTO): string {
        switch (domain) {
            case 'dataset': return (artifact as DatasetDTO).type;
            case 'form': return String((artifact as DocumentDTO).documentId);
            case 'mechanism': return (artifact as AttributionMechanismDTO).attributionMecanismPK.attributionMecanismId;
            case 'widget': return (artifact as WidgetFluiggersDTO).code;
        }
    }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class ServerItemProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public serverItems: ServerItem[] = [];

    constructor(public context: vscode.ExtensionContext) {
        this.watchConfigFile();

        onDidSelectServer(() => {
            this.serverItems = this.buildServerItems();
            this.refresh();
        });
    }

    public getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            return this.serverItems;
        }

        if (element instanceof ServerItem) {
            return (Object.keys(DOMAIN_LABELS) as DomainType[]).map(
                domain => new DomainGroupItem(domain, element.server, this.context)
            );
        }

        if (element instanceof DomainGroupItem) {
            return this.loadArtifacts(element);
        }

        return [];
    }

    public refresh(item?: TreeNode): void {
        this._onDidChangeTreeData.fire(item);
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

    public queryDataset(item: DomainGroupItem | ArtifactItem): void {
        new DatasetView(this.context, new Server(item.server)).show();
    }

    private async loadArtifacts(group: DomainGroupItem): Promise<TreeNode[]> {
        try {
            let artifacts: ArtifactDTO[] = [];

            switch (group.domain) {
                case 'dataset':   artifacts = await getCustomDatasets(group.server); break;
                case 'form':      artifacts = await getForms(group.server); break;
                case 'mechanism': artifacts = await getMechanisms(group.server); break;
                case 'widget':    artifacts = await getWidgets(group.server); break;
            }

            if (!artifacts.length) {
                const empty = new vscode.TreeItem('Nenhum item encontrado');
                return [empty];
            }

            return artifacts
                .map(a => new ArtifactItem(group.domain, group.server, a))
                .sort((a, b) => (a.label as string).localeCompare(b.label as string, 'pt-BR'));
        } catch {
            const err = new vscode.TreeItem('Erro ao carregar — verifique a conexão');
            err.iconPath = new vscode.ThemeIcon('error');
            return [err];
        }
    }

    private buildServerItems(): ServerItem[] {
        const serverConfig = getServerConfig();
        const connectedName = getSelectedServerName();

        return serverConfig.configurations
            .map(
                (element: ServerDTO) =>
                    new ServerItem(
                        this.context,
                        element.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element,
                        element.name === connectedName
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
