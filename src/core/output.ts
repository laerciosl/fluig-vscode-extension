import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('Fluig');
    }
    return channel;
}

function ts(): string {
    return new Date().toLocaleTimeString('pt-BR');
}

export function logInfo(message: string): void {
    getChannel().appendLine(`[${ts()}] [INFO] ${message}`);
}

export function logSuccess(message: string): void {
    getChannel().appendLine(`[${ts()}] [SUCCESS] ${message}`);
}

export function logError(message: string): void {
    const ch = getChannel();
    ch.appendLine(`[${ts()}] [ERROR] ${message}`);
    ch.show(true);
}

export function initOutput(): void {
    getChannel();
}

export function disposeOutput(): void {
    channel?.dispose();
    channel = undefined;
}
