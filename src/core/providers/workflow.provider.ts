import * as vscode from 'vscode';
import { glob } from 'glob';
import { getWorkspaceUri } from '../workspace.utils';

export class WorkflowProcessItem extends vscode.TreeItem {
    constructor(
        public readonly processId: string,
        public readonly eventCount: number
    ) {
        super(processId, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `${eventCount} evento(s)`;
        this.iconPath = new vscode.ThemeIcon('git-merge');
        this.contextValue = 'fluigWorkflowProcess';
        this.tooltip = processId;
    }
}

export class WorkflowEventItem extends vscode.TreeItem {
    constructor(
        public readonly processId: string,
        public readonly eventName: string,
        public readonly filePath: string
    ) {
        super(eventName, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('symbol-event');
        this.contextValue = 'fluigWorkflowEvent';
        this.resourceUri = vscode.Uri.file(filePath);
        this.command = {
            command: 'vscode.open',
            title: 'Abrir Evento',
            arguments: [vscode.Uri.file(filePath)],
        };
        this.tooltip = filePath;
    }
}

type TreeNode = WorkflowProcessItem | WorkflowEventItem | vscode.TreeItem;

export class WorkflowProvider implements vscode.TreeDataProvider<TreeNode> {
    private readonly _onChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onChange.event;

    private processes: Map<string, { event: string; path: string }[]> = new Map();
    private watcher: vscode.FileSystemWatcher | undefined;

    constructor() {
        this.scan();
        this.startWatcher();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!element) {
            return this.buildRoot();
        }
        if (element instanceof WorkflowProcessItem) {
            return this.buildEvents(element.processId);
        }
        return [];
    }

    refresh(): void {
        this.scan();
    }

    dispose(): void {
        this.watcher?.dispose();
        this._onChange.dispose();
    }

    private buildRoot(): TreeNode[] {
        if (!this.processes.size) {
            const hint = new vscode.TreeItem('Nenhum processo encontrado em workflow/scripts/', vscode.TreeItemCollapsibleState.None);
            hint.iconPath = new vscode.ThemeIcon('info');
            return [hint];
        }
        return Array.from(this.processes.entries())
            .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
            .map(([id, events]) => new WorkflowProcessItem(id, events.length));
    }

    private buildEvents(processId: string): WorkflowEventItem[] {
        return (this.processes.get(processId) || [])
            .sort((a, b) => a.event.localeCompare(b.event, 'pt-BR'))
            .map(e => new WorkflowEventItem(processId, e.event, e.path));
    }

    private scan(): void {
        try {
            const scriptsFolder = vscode.Uri.joinPath(getWorkspaceUri(), 'workflow', 'scripts').fsPath;
            const files = glob.sync(`${scriptsFolder}/*.*.js`, { nodir: true });

            const byProcess = new Map<string, { event: string; path: string }[]>();
            const pattern = /([^/\\]+)\.([^.]+)\.js$/;

            for (const filePath of files) {
                const match = filePath.match(pattern);
                if (!match) {
                    continue;
                }
                const [, processId, eventName] = match;
                if (!byProcess.has(processId)) {
                    byProcess.set(processId, []);
                }
                byProcess.get(processId)!.push({ event: eventName, path: filePath });
            }

            this.processes = byProcess;
        } catch {
            this.processes = new Map();
        }
        this._onChange.fire();
    }

    private startWatcher(): void {
        try {
            const pattern = new vscode.RelativePattern(
                vscode.Uri.joinPath(getWorkspaceUri(), 'workflow', 'scripts'),
                '*.*.js'
            );
            this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
            this.watcher.onDidCreate(() => this.scan());
            this.watcher.onDidDelete(() => this.scan());
            this.watcher.onDidChange(() => this.scan());
        } catch {
            // workspace may not be available in tests
        }
    }
}
