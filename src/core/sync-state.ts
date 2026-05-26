import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Uri, EventEmitter } from 'vscode';

export type SyncStatus = 'synced' | 'modified' | 'error';

interface SyncEntry {
    status: SyncStatus;
    hash: string;
}

const _onDidChange = new EventEmitter<Uri>();
export const onDidChangeSyncState = _onDidChange.event;

const state = new Map<string, SyncEntry>();

export function markSynced(uri: Uri): void {
    state.set(uri.fsPath, { status: 'synced', hash: hashFile(uri) });
    _onDidChange.fire(uri);
}

export function markError(uri: Uri): void {
    const existing = state.get(uri.fsPath);
    state.set(uri.fsPath, { status: 'error', hash: existing?.hash ?? '' });
    _onDidChange.fire(uri);
}

export function checkModified(uri: Uri): void {
    const entry = state.get(uri.fsPath);
    if (!entry) {
        return;
    }
    const currentHash = hashFile(uri);
    const next: SyncStatus = currentHash === entry.hash ? 'synced' : 'modified';
    if (next !== entry.status) {
        state.set(uri.fsPath, { status: next, hash: entry.hash });
        _onDidChange.fire(uri);
    }
}

export function getStatus(uri: Uri): SyncStatus | undefined {
    return state.get(uri.fsPath)?.status;
}

function hashFile(uri: Uri): string {
    try {
        return createHash('md5').update(readFileSync(uri.fsPath)).digest('hex');
    } catch {
        return '';
    }
}
