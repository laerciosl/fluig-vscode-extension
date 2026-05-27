import * as vscode from 'vscode';
import { Server } from '../server.model';
import { FluigArtifactProvider } from './artifact.provider';
import { DatasetDTO } from '../../fluig/datasets/dataset.types';
import { getCustomDatasets } from '../../fluig/datasets/dataset.service';

export class DatasetItem extends vscode.TreeItem {
    constructor(public readonly dataset: DatasetDTO, public readonly server: vscode.Uri | undefined) {
        super(dataset.datasetId, vscode.TreeItemCollapsibleState.None);
        this.description = dataset.type;
        this.iconPath = new vscode.ThemeIcon('database');
        this.contextValue = 'fluigDatasetItem';
        this.tooltip = new vscode.MarkdownString(
            `**${dataset.datasetId}**\n\n_${dataset.type}_`
        );
    }
}

export class DatasetProvider extends FluigArtifactProvider<DatasetDTO> {
    protected async loadItems(server: Server): Promise<DatasetDTO[]> {
        const items = await getCustomDatasets(server);
        return items.sort((a, b) => a.datasetId.localeCompare(b.datasetId, 'pt-BR'));
    }

    protected toTreeItem(item: DatasetDTO): vscode.TreeItem {
        return new DatasetItem(item, undefined);
    }
}
