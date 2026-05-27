import { Uri, window, workspace, ProgressLocation } from 'vscode';
import { basename } from 'path';
import { readFileSync } from 'fs';
import { ServerDTO } from '../../types/server.types';
import { GlobalEventDTO } from './global-event.types';
import { getWorkspaceUri, confirmPassword } from '../../core/workspace.utils';
import { getSelect } from '../../core/server.service';
import { createLogger } from '../../core/logger';

const log = createLogger('[EVENT]');
import { emitSuccess, emitError } from '../../core/event-bus';
import { fetchWithAuth, getRestUrl } from '@fluiggers/sdk';

const BASE_PATH = '/ecm/api/rest/ecm/globalevent/';

// ── API calls ──────────────────────────────────────────────────────────────

async function apiGetEventList(server: ServerDTO): Promise<GlobalEventDTO[]> {
    const response: any = await fetchWithAuth(
        server,
        getRestUrl(server, BASE_PATH, 'getEventList'),
        { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
    ).then(r => r.json());

    if (response.message) {
        throw new Error(response.message.message);
    }

    return response;
}

async function apiSaveEventList(
    server: ServerDTO,
    globalEvents: GlobalEventDTO[]
): Promise<any> {
    return fetchWithAuth(server, getRestUrl(server, BASE_PATH, 'saveEventList'), {
        method: 'post',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify(globalEvents),
    }).then(r => r.json());
}

async function apiDeleteGlobalEvent(
    server: ServerDTO,
    eventName: string
): Promise<any> {
    const url = getRestUrl(server, BASE_PATH, 'deleteGlobalEvent');
    url.searchParams.set('eventName', eventName);

    return fetchWithAuth(server, url, {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    }).then(r => r.json());
}

// ── Import ─────────────────────────────────────────────────────────────────

export async function importOne(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const event = await pickEvent(server);
    if (!event) {
        return;
    }

    log.info(`Importando evento global: ${event.globalEventPK.eventId} ← ${server.name}`);
    await saveFile(server, event.globalEventPK.eventId, event.eventDescription);
}

export async function importMany(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const eventList = await pickManyEvents(server);
    if (!eventList?.length) {
        return;
    }

    log.info(`Importando ${eventList.length} evento(s) global(is) ← ${server.name}`);
    const results = await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Importando Eventos Globais.', cancellable: false },
        progress => {
            const increment = 100 / eventList.length;
            let current = 0;
            progress.report({ increment: 0 });

            return Promise.all(
                eventList.map(async event => {
                    await saveFile(server, event.globalEventPK.eventId, event.eventDescription, false);
                    current += increment;
                    progress.report({ increment: current });
                    return true;
                })
            );
        }
    );

    window.showInformationMessage(`${results.length} Eventos Globais foram importados.`);
}

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportOne(fileUri: Uri): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    const globalEventId = basename(fileUri.fsPath, '.js');
    log.info(`Exportando evento global: ${globalEventId} → ${server.name}`);

    let globalEvents: GlobalEventDTO[];
    try {
        globalEvents = await apiGetEventList(server);
    } catch (error: any) {
        emitError({
            kind: 'global-event',
            operation: 'export',
            name: globalEventId,
            serverName: server.name,
            uri: fileUri,
            error: error.message || String(error),
        });
        return;
    }

    const structure: GlobalEventDTO = {
        globalEventPK: { companyId: server.companyId, eventId: globalEventId },
        eventDescription: readFileSync(fileUri.fsPath, 'utf8'),
    };

    const index = globalEvents.findIndex(e => e.globalEventPK.eventId === globalEventId);
    if (index === -1) {
        globalEvents.push(structure);
    } else {
        globalEvents[index] = structure;
    }

    try {
        const result: any = await apiSaveEventList(server, globalEvents);

        if (result?.content === 'OK') {
            emitSuccess({
                kind: 'global-event',
                operation: 'export',
                name: globalEventId,
                serverName: server.name,
                uri: fileUri,
            });
        } else {
            emitError({
                kind: 'global-event',
                operation: 'export',
                name: globalEventId,
                serverName: server.name,
                uri: fileUri,
                error: result?.message?.message || 'Erro ao exportar evento global.',
            });
        }
    } catch (error: any) {
        emitError({
            kind: 'global-event',
            operation: 'export',
            name: globalEventId,
            serverName: server.name,
            uri: fileUri,
            error: error.message || String(error),
        });
    }
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteEvents(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const eventList = await pickManyEvents(server);
    if (!eventList) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    for (const event of eventList) {
        const result: any = await apiDeleteGlobalEvent(server, event.globalEventPK.eventId);

        if (result?.content === 'OK') {
            window.showInformationMessage(
                `Evento Global ${event.globalEventPK.eventId} removido com sucesso!`
            );
        } else {
            window.showErrorMessage(
                `Erro ao remover Evento Global ${event.globalEventPK.eventId}!\n${result?.message?.message}`
            );
        }
    }
}

// ── File helpers ───────────────────────────────────────────────────────────

async function saveFile(server: ServerDTO, name: string, content: string, openFile = true): Promise<void> {
    const uri = Uri.joinPath(getWorkspaceUri(), 'events', `${name}.js`);
    await workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));

    emitSuccess({
        kind: 'global-event',
        operation: 'import',
        name,
        serverName: server.name,
        uri,
        silent: !openFile,
    });
    if (openFile) {
        window.showTextDocument(uri);
    }
}

// ── Remote content for diff ────────────────────────────────────────────────

export async function getGlobalEventContent(server: ServerDTO, eventId: string): Promise<string> {
    const eventList = await apiGetEventList(server);
    const event = eventList.find(e => e.globalEventPK.eventId === eventId);
    if (!event) { throw new Error(`Evento global não encontrado: ${eventId}`); }
    return event.eventDescription;
}

// ── QuickPick helpers ──────────────────────────────────────────────────────

async function pickEvent(server: ServerDTO): Promise<GlobalEventDTO | undefined> {
    const eventList = await apiGetEventList(server);
    const items = eventList.map(e => ({ label: e.globalEventPK.eventId }));
    const result = await window.showQuickPick(items, { placeHolder: 'Selecione o evento' });
    if (!result) {
        return undefined;
    }
    return eventList.find(e => e.globalEventPK.eventId === result.label);
}

async function pickManyEvents(
    server: ServerDTO
): Promise<GlobalEventDTO[] | undefined> {
    const eventList = await apiGetEventList(server);
    const items = eventList.map(e => ({ label: e.globalEventPK.eventId }));
    const result = await window.showQuickPick(items, {
        placeHolder: 'Selecione os eventos',
        canPickMany: true,
    });
    if (!result) {
        return undefined;
    }
    const selected = result.map(r => r.label);
    return eventList.filter(e => selected.includes(e.globalEventPK.eventId));
}
