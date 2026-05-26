import { vi } from 'vitest';

// ── Uri ────────────────────────────────────────────────────────────────────

type MockUri = { path: string; fsPath: string };

export const Uri = {
    joinPath(base: MockUri, ...parts: string[]): MockUri {
        const joined = [base.path.replace(/\/$/, ''), ...parts].join('/');
        return { path: joined, fsPath: joined };
    },
    file(filePath: string): MockUri {
        return { path: filePath, fsPath: filePath };
    },
};

// ── window ─────────────────────────────────────────────────────────────────

export const window = {
    showInputBox: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showTextDocument: vi.fn(),
    showOpenDialog: vi.fn(),
    withProgress: vi.fn((_opts: any, task: (p: any) => any) => task({ report: vi.fn() })),
    createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
    })),
    createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        text: '',
        tooltip: '',
        command: '',
        backgroundColor: undefined,
    })),
    registerFileDecorationProvider: vi.fn(() => ({ dispose: vi.fn() })),
};

// ── workspace ──────────────────────────────────────────────────────────────

export const workspace = {
    getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, defaultValue?: any) => defaultValue),
        update: vi.fn(),
    })),
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        delete: vi.fn(),
        readDirectory: vi.fn(),
    },
    workspaceFolders: [
        { uri: { path: '/test-workspace', fsPath: '/test-workspace' }, name: 'test', index: 0 },
    ],
};

// ── commands ───────────────────────────────────────────────────────────────

export const commands = {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
};

// ── EventEmitter ───────────────────────────────────────────────────────────

export class EventEmitter<T> {
    private listeners: ((data: T) => void)[] = [];

    event = (listener: (data: T) => void) => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter(l => l !== listener);
            },
        };
    };

    fire(data: T): void {
        this.listeners.forEach(l => l(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}

// ── FileDecoration / ThemeColor ────────────────────────────────────────────

export class FileDecoration {
    constructor(
        public badge?: string,
        public tooltip?: string,
        public color?: ThemeColor
    ) {}
}

export class ThemeColor {
    constructor(public id: string) {}
}

// ── Enums ──────────────────────────────────────────────────────────────────

export enum ProgressLocation {
    Notification = 15,
    Window = 10,
    SourceControl = 1,
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export const extensions = {
    getExtension: vi.fn(),
};
