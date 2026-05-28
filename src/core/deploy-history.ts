import { ArtifactKind } from './event-bus';

export type DeployStatus = 'success' | 'error' | 'blocked';

export interface DeployRecord {
    readonly timestamp: Date;
    readonly artifactName: string;
    readonly kind: ArtifactKind;
    readonly serverName: string;
    readonly status: DeployStatus;
    readonly fsPath?: string;
    readonly error?: string;
}

const MAX_RECORDS = 100;
const _records: DeployRecord[] = [];

export function pushDeployRecord(record: DeployRecord): void {
    _records.unshift(record);
    if (_records.length > MAX_RECORDS) {
        _records.pop();
    }
}

export function getDeployRecords(): readonly DeployRecord[] {
    return _records;
}

export function getLastSuccessfulExports(limit = 10): DeployRecord[] {
    return _records.filter(r => r.status === 'success').slice(0, limit);
}

export function clearDeployHistory(): void {
    _records.length = 0;
}
