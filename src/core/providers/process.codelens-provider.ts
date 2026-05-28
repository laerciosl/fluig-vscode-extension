import * as vscode from 'vscode';
import { getProcessDefinition } from '../../fluig/workflow/process/process.cache';

/**
 * CodeLenses no topo de arquivos `.process` com ações rápidas e métricas.
 */
export class ProcessCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;

    constructor() {
        // Atualiza lenses quando o documento muda — getProcessDefinition já é cacheado por versão.
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'fluig-process') {
                this._onDidChange.fire();
            }
        });
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const def = getProcessDefinition(document);
        if (!def) {
            return [];
        }

        const topRange = new vscode.Range(0, 0, 0, 0);
        const lenses: vscode.CodeLens[] = [];

        lenses.push(new vscode.CodeLens(topRange, {
            title: '$(preview) Visualizar Workflow',
            command: 'fluiggers-fluig-vscode-extension.previewProcess',
            arguments: [document.uri],
            tooltip: 'Abre a visualização do processo (em desenvolvimento)',
        }));

        lenses.push(new vscode.CodeLens(topRange, {
            title: '$(checklist) Validar',
            command: 'fluiggers-fluig-vscode-extension.validateProcess',
            arguments: [document.uri],
            tooltip: 'Verifica scripts ausentes e referências quebradas',
        }));

        const tasks = def.activities.filter(a => a.kind === 'task').length;
        const services = def.activities.filter(a => a.kind === 'service-task').length;
        const gateways = def.activities.filter(a => a.kind === 'gateway-exclusive').length;
        const subprocesses = def.activities.filter(a => a.kind === 'subprocess').length;

        const summary = [
            `${tasks} tarefa(s)`,
            `${services} serviço(s)`,
            `${gateways} gateway(s)`,
            ...(subprocesses > 0 ? [`${subprocesses} sub-processo(s)`] : []),
        ].join(' · ');

        lenses.push(new vscode.CodeLens(topRange, {
            title: `$(info) ${def.metadata.name || def.metadata.id} v${def.metadata.version} — ${summary}`,
            command: '',
        }));

        return lenses;
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
