import * as vscode from 'vscode';
import * as fs from 'fs';
import { ServerDTO } from '../../types/server.types';
import { Server } from '../server.model';
import { createOrUpdate } from '../server.service';
import { clearCookies } from '../../sdk/hapi/login.client';
import { getUser } from '../../sdk/hapi/user.client';

const compile = require('template-literal');

export class ServerView {
    private currentPanel: vscode.WebviewPanel | undefined = undefined;
    private serverData: ServerDTO | undefined = undefined;

    constructor(private context: vscode.ExtensionContext) {}

    public setServerData(server: ServerDTO): void {
        this.serverData = server;
    }

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
            'dist', 'views', 'server', 'server.html'
        );
        const runTemplate = compile(
            fs.readFileSync(htmlPath.with({ scheme: 'vscode-resource' }).fsPath)
        );

        return runTemplate({
            jquery: this.currentPanel?.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'jquery.min.js')
            ),
            bootstrapCss: this.currentPanel?.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'bootstrap.min.css')
            ),
            themeCss: this.currentPanel?.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'css', 'theme.css')
            ),
            serverJs: this.currentPanel?.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'views', 'server', 'server.js')
            ),
            serverData: this.serverData,
            ssl: this.serverData?.ssl || false,
            confirmExporting: this.serverData?.confirmExporting || false,
        });
    }

    private createPanel(): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'fluig-vscode-extension.addServer',
            this.serverData !== undefined ? 'Editar Servidor' : 'Adicionar Servidor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true,
            }
        );
    }

    private onMessage(obj: any): void {
        if (obj.hasBrowser && !obj.companyId) {
            return;
        }
        if (!obj.hasBrowser && (!obj.username || !obj.password)) {
            return;
        }
        if (!obj.name || !obj.host || !obj.port) {
            return;
        }
        if (!this.currentPanel?.webview) {
            return;
        }

        const webview = this.currentPanel.webview;
        const server: ServerDTO = new Server();
        server.id = obj.id;
        server.name = obj.name;
        server.host = obj.host;
        server.ssl = obj.ssl;
        server.port = parseInt(obj.port);
        server.userCode = '';
        server.hasBrowser = obj.hasBrowser;
        server.companyId = obj.hasBrowser ? obj.companyId : '';
        server.username = !obj.hasBrowser ? obj.username : '';
        server.password = !obj.hasBrowser ? obj.password : '';
        server.confirmExporting = !obj.hasBrowser && obj.confirmExporting;

        getUser(server)
            .then((response: any) => {
                if (!response.content) {
                    throw response.message?.message;
                }
                if (server.companyId && server.companyId !== response.content.tenantId) {
                    clearCookies(server);
                    throw new Error(
                        'O servidor retornou um Código da empresa diferente do Código informado.'
                    );
                }

                server.companyId = response.content.tenantId;
                server.userCode = response.content.userCode;

                createOrUpdate(server);

                if (this.currentPanel) {
                    this.currentPanel.dispose();
                }
            })
            .catch(e => {
                webview.postMessage({ command: 'error', message: e.message || e });
                vscode.window.showErrorMessage(
                    `Falha na conexão com o servidor ${server.name}.\nErro retornado: ${e.message || e}`
                );
            });
    }
}
