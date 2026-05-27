import { EventEmitter, Event, Uri, Disposable } from 'vscode';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Server } from './server.model';
import { DeployQueue } from './deploy-queue';

export type SyncStatus = 'synced' | 'modified' | 'error';

interface SyncEntry {
    status: SyncStatus;
    hash: string;
}

export class RuntimeState implements Disposable {
    // ── Active server ─────────────────────────────────────────────────────────

    private _activeServer: Server | null = null;
    private readonly _onSelectServer = new EventEmitter<Server | null>();
    readonly onDidSelectServer: Event<Server | null> = this._onSelectServer.event;

    get activeServer(): Server | null {
        return this._activeServer;
    }

    selectServer(server: Server): void {
        this._activeServer = server;
        this._onSelectServer.fire(server);
    }

    deselectServer(): void {
        this._activeServer = null;
        this._onSelectServer.fire(null);
    }

    // ── Sync map ──────────────────────────────────────────────────────────────

    private readonly _syncMap = new Map<string, SyncEntry>();
    private readonly _onSyncChange = new EventEmitter<Uri>();
    readonly onDidChangeSyncState: Event<Uri> = this._onSyncChange.event;

    markSynced(uri: Uri): void {
        this._syncMap.set(uri.fsPath, { status: 'synced', hash: this.hashFile(uri) });
        this._onSyncChange.fire(uri);
    }

    markError(uri: Uri): void {
        const existing = this._syncMap.get(uri.fsPath);
        this._syncMap.set(uri.fsPath, { status: 'error', hash: existing?.hash ?? '' });
        this._onSyncChange.fire(uri);
    }

    checkModified(uri: Uri): void {
        const entry = this._syncMap.get(uri.fsPath);
        if (!entry) {
            return;
        }
        const currentHash = this.hashFile(uri);
        const next: SyncStatus = currentHash === entry.hash ? 'synced' : 'modified';
        if (next !== entry.status) {
            this._syncMap.set(uri.fsPath, { status: next, hash: entry.hash });
            this._onSyncChange.fire(uri);
        }
    }

    getStatus(uri: Uri): SyncStatus | undefined {
        return this._syncMap.get(uri.fsPath)?.status;
    }

    // ── Deploy queue ──────────────────────────────────────────────────────────

    readonly deployQueue = new DeployQueue();

    private readonly _onDeploySize = new EventEmitter<number>();
    readonly onDidChangeDeploySize: Event<number> = this._onDeploySize.event;

    constructor() {
        this.deployQueue.onQueueChange = (size) => this._onDeploySize.fire(size);
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose(): void {
        this._onSelectServer.dispose();
        this._onSyncChange.dispose();
        this._onDeploySize.dispose();
        this.deployQueue.cancelAll();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private hashFile(uri: Uri): string {
        try {
            return createHash('md5').update(readFileSync(uri.fsPath)).digest('hex');
        } catch {
            return '';
        }
    }
}

// ── Singleton accessor ─────────────────────────────────────────────────────

let _instance: RuntimeState | undefined;

export function initRuntime(state: RuntimeState): void {
    _instance = state;
}

export function getRuntime(): RuntimeState {
    if (!_instance) {
        throw new Error('RuntimeState not initialized — call initRuntime() in activate()');
    }
    return _instance;
}
