import * as vscode from 'vscode';
import { glob } from 'glob';
import { getWorkspaceUri } from '../workspace.utils';

export class WorkflowProcessItem extends vscode.TreeItem {
    constructor(
        public readonly processId: string,
        public readonly eventCount: number,
        public readonly processFilePath?: string
    ) {
        super(processId, vscode.TreeItemCollapsibleState.Collapsed);
        const parts: string[] = [];
        if (processFilePath) {
            parts.push('.process');
        }
        parts.push(`${eventCount} evento(s)`);
        this.description = parts.join(' · ');
        this.iconPath = new vscode.ThemeIcon(processFilePath ? 'git-merge' : 'warning');
        this.contextValue = processFilePath ? 'fluigWorkflowProcessWithFile' : 'fluigWorkflowProcess';
        this.tooltip = processFilePath
            ? `${processId}\n${processFilePath}`
            : `${processId} (sem .process local)`;
    }
}

export class WorkflowProcessFileItem extends vscode.TreeItem {
    constructor(
        public readonly processId: string,
        public readonly filePath: string
    ) {
        super(`${processId}.process`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('preview');
        this.contextValue = 'fluigWorkflowProcessFile';
        this.resourceUri = vscode.Uri.file(filePath);
        this.command = {
            command: 'fluiggers-fluig-vscode-extension.previewProcess',
            title: 'Visualizar Workflow',
            arguments: [vscode.Uri.file(filePath)],
        };
        this.tooltip = `Clique para visualizar o workflow\n${filePath}`;
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

type TreeNode = WorkflowProcessItem | WorkflowEventItem | WorkflowProcessFileItem | vscode.TreeItem;

export class WorkflowProvider implements vscode.TreeDataProvider<TreeNode> {
    private readonly _onChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onChange.event;

    private processes: Map<string, { event: string; path: string }[]> = new Map();
    private processFiles: Map<string, string> = new Map();
    private watchers: vscode.FileSystemWatcher[] = [];

    constructor() {
        this.scan();
        this.startWatchers();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!element) {
            return this.buildRoot();
        }
        if (element instanceof WorkflowProcessItem) {
            return this.buildChildren(element.processId);
        }
        return [];
    }

    refresh(): void {
        this.scan();
    }

    dispose(): void {
        for (const w of this.watchers) {
            w.dispose();
        }
        this.watchers.length = 0;
        this._onChange.dispose();
    }

    private buildRoot(): TreeNode[] {
        const allProcessIds = new Set<string>([
            ...this.processes.keys(),
            ...this.processFiles.keys(),
        ]);
        if (allProcessIds.size === 0) {
            const hint = new vscode.TreeItem('Nenhum processo encontrado em workflow/', vscode.TreeItemCollapsibleState.None);
            hint.iconPath = new vscode.ThemeIcon('info');
            return [hint];
        }
        return Array.from(allProcessIds)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .map(id => new WorkflowProcessItem(
                id,
                (this.processes.get(id) ?? []).length,
                this.processFiles.get(id)
            ));
    }

    private buildChildren(processId: string): TreeNode[] {
        const children: TreeNode[] = [];
        const processFile = this.processFiles.get(processId);
        if (processFile) {
            children.push(new WorkflowProcessFileItem(processId, processFile));
        }
        const events = (this.processes.get(processId) || [])
            .sort((a, b) => a.event.localeCompare(b.event, 'pt-BR'))
            .map(e => new WorkflowEventItem(processId, e.event, e.path));
        return [...children, ...events];
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

            const workflowFolder = vscode.Uri.joinPath(getWorkspaceUri(), 'workflow').fsPath;
            const processFiles = glob.sync(`${workflowFolder}/*.process`, { nodir: true });
            const byProcessFile = new Map<string, string>();
            for (const filePath of processFiles) {
                const fileName = filePath.split(/[/\\]/).pop() ?? '';
                const processId = fileName.replace(/\.process$/, '');
                if (processId) {
                    byProcessFile.set(processId, filePath);
                }
            }
            this.processFiles = byProcessFile;
        } catch {
            this.processes = new Map();
            this.processFiles = new Map();
        }
        this._onChange.fire();
    }

    private startWatchers(): void {
        try {
            const scriptsPattern = new vscode.RelativePattern(
                vscode.Uri.joinPath(getWorkspaceUri(), 'workflow', 'scripts'),
                '*.*.js'
            );
            const scriptsWatcher = vscode.workspace.createFileSystemWatcher(scriptsPattern);
            scriptsWatcher.onDidCreate(() => this.scan());
            scriptsWatcher.onDidDelete(() => this.scan());
            scriptsWatcher.onDidChange(() => this.scan());

            const processPattern = new vscode.RelativePattern(
                vscode.Uri.joinPath(getWorkspaceUri(), 'workflow'),
                '*.process'
            );
            const processWatcher = vscode.workspace.createFileSystemWatcher(processPattern);
            processWatcher.onDidCreate(() => this.scan());
            processWatcher.onDidDelete(() => this.scan());

            this.watchers = [scriptsWatcher, processWatcher];
        } catch {
            // workspace may not be available in tests
        }
    }
}
