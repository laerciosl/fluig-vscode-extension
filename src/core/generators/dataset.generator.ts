import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { getWorkspaceUri } from '../workspace.utils';
import { TemplateService } from '../template.service';

export async function createDataset(): Promise<void> {
    let dataset = (await vscode.window.showInputBox({
        prompt: 'Qual o nome do Dataset (sem espaços e sem caracteres especiais)?',
        placeHolder: 'ds_nome_dataset',
    })) || '';

    if (!dataset) {
        return;
    }

    if (!dataset.endsWith('.js')) {
        dataset += '.js';
    }

    const datasetUri = vscode.Uri.joinPath(getWorkspaceUri(), 'datasets', dataset);

    try {
        await vscode.workspace.fs.stat(datasetUri);
        void vscode.window.showTextDocument(datasetUri);
        return;
    } catch {
        // arquivo não existe, seguir com a criação
    }

    await vscode.workspace.fs.writeFile(
        datasetUri,
        readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'createDataset.js').fsPath)
    );
    vscode.window.showTextDocument(datasetUri);
}
