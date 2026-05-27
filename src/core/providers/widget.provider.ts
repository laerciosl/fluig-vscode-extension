import * as vscode from 'vscode';
import { Server } from '../server.model';
import { FluigArtifactProvider } from './artifact.provider';
import { WidgetFluiggersDTO } from '../../fluig/widgets/widget.types';
import { getWidgets } from '../../fluig/widgets/widget.service';

export class WidgetItem extends vscode.TreeItem {
    constructor(public readonly widget: WidgetFluiggersDTO) {
        super(widget.title, vscode.TreeItemCollapsibleState.None);
        this.description = widget.code;
        this.iconPath = new vscode.ThemeIcon('extensions');
        this.contextValue = 'fluigWidgetItem';
        this.tooltip = new vscode.MarkdownString(
            `**${widget.title}** (\`${widget.code}\`)\n\n${widget.description || ''}`
        );
    }
}

export class WidgetProvider extends FluigArtifactProvider<WidgetFluiggersDTO> {
    protected async loadItems(server: Server): Promise<WidgetFluiggersDTO[]> {
        const items = await getWidgets(server);
        return items.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    }

    protected toTreeItem(item: WidgetFluiggersDTO): vscode.TreeItem {
        return new WidgetItem(item);
    }
}
