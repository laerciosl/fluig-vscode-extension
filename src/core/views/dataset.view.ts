import * as vscode from 'vscode';
import * as fs from 'fs';
import { Server } from '../server.model';
import { getDatasets, getResultDataset } from '../../fluig/datasets/dataset.service';

const compile = require('template-literal');

export class DatasetView {
    private currentPanel: vscode.WebviewPanel | undefined = undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private server: Server
    ) {}

    public show(): void {
        this.currentPanel = this.createPanel();
        this.currentPanel.webview.html = this.getHtml();
        this.currentPanel.onDidDispose(() => (this.currentPanel = undefined), null);
        this.currentPanel.webview.onDidReceiveMessage(
            obj => this.onMessage(obj),
            undefined
        );
    }

    private getHtml(): string {
        const htmlPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'dist', 'views', 'dataset', 'dataset.html'
        );
        const runTemplate = compile(
            fs.readFileSync(htmlPath.with({ scheme: 'vscode-resource' }).fsPath)
        );
        const webview = this.currentPanel!.webview;
        const uri = (p: string[]) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, ...p)
            );

        return runTemplate({
            jquery: uri(['dist', 'libs', 'jquery.min.js']),
            bootstrapCss: uri(['dist', 'libs', 'bootstrap.min.css']),
            bootstrapJs: uri(['dist', 'libs', 'bootstrap.min.js']),
            select2Css: uri(['dist', 'libs', 'select2.min.css']),
            select2Js: uri(['dist', 'libs', 'select2.min.js']),
            datatablesCss: uri(['dist', 'libs', 'datatables.min.css']),
            datatablesJs: uri(['dist', 'libs', 'datatables.min.js']),
            html5SortableJs: uri(['dist', 'libs', 'html5sortable.min.js']),
            themeCss: uri(['dist', 'css', 'theme.css']),
            datasetCss: uri(['dist', 'views', 'dataset', 'dataset.css']),
            datasetJs: uri(['dist', 'views', 'dataset', 'dataset.js']),
            serverName: this.server.name,
        });
    }

    private createPanel(): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'fluig-vscode-extension.consultarDataset',
            `${this.server.name}: Consultar Dataset`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true,
            }
        );
    }

    private onMessage(obj: any): void {
        switch (obj.command) {
            case 'consult_dataset':
                this.consultDataset(obj);
                break;
            case 'load_datasets':
                this.loadDatasets();
                break;
            case 'error':
                vscode.window.showErrorMessage(obj.message);
                break;
        }
    }

    private async loadDatasets(): Promise<void> {
        if (!this.currentPanel) {
            return;
        }

        try {
            const datasets = await getDatasets(this.server);
            const datasetOptions = datasets.map(ds => ({
                id: ds.datasetId,
                text: ds.datasetId,
            }));

            this.currentPanel.webview.postMessage({
                command: 'load_datasets',
                datasets: datasetOptions,
            });
        } catch (err: any) {
            const message = err instanceof Error ? err.message : err;
            this.currentPanel.webview.postMessage({ command: 'error', message });
            vscode.window.showErrorMessage(
                `Erro ao carregar os datasets do servidor ${this.server.name}.\nErro retornado: ${message}`
            );
        }
    }

    private async consultDataset(queryInfo: any): Promise<void> {
        if (!this.currentPanel || !queryInfo) {
            return;
        }

        try {
            const queryResult = await getResultDataset(
                this.server,
                queryInfo.datasetId,
                queryInfo.fields,
                queryInfo.constraints,
                queryInfo.order
            );

            this.currentPanel.webview.postMessage({ command: 'query_result', queryResult });
        } catch (err: any) {
            const message = err instanceof Error ? err.message : err;
            this.currentPanel.webview.postMessage({ command: 'error', message });
            vscode.window.showErrorMessage(
                `Erro ao consultar o Dataset ${queryInfo.datasetId}.\nErro retornado: ${message}`
            );
        }
    }
}
