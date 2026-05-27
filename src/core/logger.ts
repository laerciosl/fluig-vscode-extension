import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('Fluig');
    }
    return channel;
}

function ts(): string {
    return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function isDebugEnabled(): boolean {
    return vscode.workspace.getConfiguration('fluiggers').get<boolean>('debugLogging', false);
}

export class Logger {
    constructor(private readonly ns: string) {}

    info(message: string): void {
        getChannel().appendLine(`[${ts()}] ${this.ns} [INFO] ${message}`);
    }

    success(message: string): void {
        getChannel().appendLine(`[${ts()}] ${this.ns} [OK] ${message}`);
    }

    error(message: string): void {
        const ch = getChannel();
        ch.appendLine(`[${ts()}] ${this.ns} [ERR] ${message}`);
        ch.show(true);
    }

    debug(message: string): void {
        if (isDebugEnabled()) {
            getChannel().appendLine(`[${ts()}] ${this.ns} [DBG] ${message}`);
        }
    }
}

export function createLogger(namespace: string): Logger {
    return new Logger(namespace);
}

export function initLogger(): void {
    getChannel();
}

export function showLogger(): void {
    getChannel().show(true);
}

export function disposeLogger(): void {
    channel?.dispose();
    channel = undefined;
}
