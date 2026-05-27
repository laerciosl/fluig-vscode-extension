import * as vscode from 'vscode';
import { Server } from '../server.model';
import { FluigArtifactProvider } from './artifact.provider';
import { DocumentDTO } from '../../fluig/forms/form.types';
import { getForms } from '../../fluig/forms/form.service';

export class FormItem extends vscode.TreeItem {
    constructor(public readonly form: DocumentDTO) {
        super(form.documentDescription, vscode.TreeItemCollapsibleState.None);
        this.description = String(form.documentId);
        this.iconPath = new vscode.ThemeIcon('symbol-file');
        this.contextValue = 'fluigFormItem';
        this.tooltip = new vscode.MarkdownString(
            `**${form.documentDescription}**\n\nID: ${form.documentId}`
        );
    }
}

export class FormProvider extends FluigArtifactProvider<DocumentDTO> {
    protected async loadItems(server: Server): Promise<DocumentDTO[]> {
        const items = await getForms(server);
        return items.sort((a, b) =>
            a.documentDescription.localeCompare(b.documentDescription, 'pt-BR')
        );
    }

    protected toTreeItem(item: DocumentDTO): vscode.TreeItem {
        return new FormItem(item);
    }
}
