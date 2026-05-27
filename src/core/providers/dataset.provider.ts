import * as vscode from 'vscode';
import { glob } from 'glob';
import { Server } from '../server.model';
import { getWorkspaceUri } from '../workspace.utils';
import { FluigArtifactProvider } from './artifact.provider';
import { DatasetDTO } from '../../fluig/datasets/dataset.types';
import { getCustomDatasets } from '../../fluig/datasets/dataset.service';

type DatasetWithPath = DatasetDTO & { localPath?: string };

export class DatasetItem extends vscode.TreeItem {
    constructor(public readonly dataset: DatasetWithPath) {
        super(dataset.datasetId, vscode.TreeItemCollapsibleState.None);
        this.description = dataset.type;
        this.iconPath = new vscode.ThemeIcon('database');
        this.contextValue = 'fluigDatasetItem';
        this.tooltip = new vscode.MarkdownString(`**${dataset.datasetId}**\n\n_${dataset.type}_`);
        if (dataset.localPath) {
            this.resourceUri = vscode.Uri.file(dataset.localPath);
        }
    }
}

export class DatasetProvider extends FluigArtifactProvider<DatasetWithPath> {
    protected async loadItems(server: Server): Promise<DatasetWithPath[]> {
        const items = await getCustomDatasets(server);
        const dir = vscode.Uri.joinPath(getWorkspaceUri(), 'datasets').fsPath;
        return items
            .map(dto => ({
                ...dto,
                localPath: glob.sync(`${dir}/**/${dto.datasetId}.js`, { nodir: true })[0],
            }))
            .sort((a, b) => a.datasetId.localeCompare(b.datasetId, 'pt-BR'));
    }

    protected toTreeItem(item: DatasetWithPath): DatasetItem {
        return new DatasetItem(item);
    }
}
