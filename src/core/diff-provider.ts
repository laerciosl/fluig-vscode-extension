import * as vscode from 'vscode';
import { ServerDTO } from '../types/server.types';
import { getRuntime } from './runtime-state';

export const REMOTE_SCHEME = 'fluig-remote';

type ContentFetcher = (name: string, server: ServerDTO) => Promise<string>;
const _fetchers = new Map<string, ContentFetcher>();

export function registerContentFetcher(kind: string, fetcher: ContentFetcher): void {
    _fetchers.set(kind, fetcher);
}

export function buildRemoteUri(kind: string, name: string): vscode.Uri {
    return vscode.Uri.from({
        scheme: REMOTE_SCHEME,
        path: `/${kind}/${encodeURIComponent(name)}`,
    });
}

export class FluigRemoteContentProvider implements vscode.TextDocumentContentProvider {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const server = getRuntime().activeServer;
        if (!server) {
            return '// Nenhum servidor conectado.';
        }

        const parts = uri.path.split('/').filter(Boolean);
        const kind = parts[0];
        const name = decodeURIComponent(parts.slice(1).join('/'));

        const fetcher = _fetchers.get(kind);
        if (!fetcher) {
            return `// Diff não disponível para: ${kind}`;
        }

        try {
            return await fetcher(name, server);
        } catch (e: any) {
            return `// Erro ao buscar conteúdo remoto: ${e?.message || String(e)}`;
        }
    }
}
