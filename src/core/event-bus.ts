import { EventEmitter, Event, Uri } from 'vscode';

export type ArtifactKind =
    | 'dataset'
    | 'form'
    | 'widget'
    | 'workflow'
    | 'global-event'
    | 'mechanism';

export type OperationKind = 'export' | 'import';

export interface ArtifactEvent {
    kind: ArtifactKind;
    operation: OperationKind;
    name: string;
    serverName: string;
    uri?: Uri;
}

export interface ArtifactErrorEvent extends ArtifactEvent {
    error: string;
}

// ── Emitters ───────────────────────────────────────────────────────────────

const _onArtifactSuccess = new EventEmitter<ArtifactEvent>();
const _onArtifactError = new EventEmitter<ArtifactErrorEvent>();

export const onArtifactSuccess: Event<ArtifactEvent> = _onArtifactSuccess.event;
export const onArtifactError: Event<ArtifactErrorEvent> = _onArtifactError.event;

export function emitSuccess(event: ArtifactEvent): void {
    _onArtifactSuccess.fire(event);
}

export function emitError(event: ArtifactErrorEvent): void {
    _onArtifactError.fire(event);
}

export function disposeEventBus(): void {
    _onArtifactSuccess.dispose();
    _onArtifactError.dispose();
}
