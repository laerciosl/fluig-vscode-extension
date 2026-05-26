import { Uri, window, workspace, ProgressLocation } from 'vscode';
import { basename } from 'path';
import { readFileSync } from 'fs';
import { ServerDTO } from '../../types/server.types';
import { GlobalEventDTO } from './global-event.types';
import { getWorkspaceUri, confirmPassword } from '../../core/workspace.utils';
import { getSelect } from '../../core/server.service';
import { markSynced, markError } from '../../core/sync-state';
import { loginAndGetCookies, getRestUrl } from '@fluiggers/sdk';

const BASE_PATH = '/ecm/api/rest/ecm/globalevent/';

// ── API calls ──────────────────────────────────────────────────────────────

async function apiGetEventList(server: ServerDTO): Promise<GlobalEventDTO[]> {
    try {
        const headers = buildHeaders(await loginAndGetCookies(server));
        const response: any = await fetch(
            getRestUrl(server, BASE_PATH, 'getEventList'),
            { headers }
        ).then(r => r.json());

        if (response.message) {
            window.showErrorMessage(response.message.message);
            return [];
        }

        return response;
    } catch (error: any) {
        window.showErrorMessage(error.message || error);
        return [];
    }
}

async function apiSaveEventList(
    server: ServerDTO,
    globalEvents: GlobalEventDTO[]
): Promise<any> {
    try {
        return await fetch(getRestUrl(server, BASE_PATH, 'saveEventList'), {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: await loginAndGetCookies(server),
            },
            body: JSON.stringify(globalEvents),
        }).then(r => r.json());
    } catch (error: any) {
        window.showErrorMessage(error.message || error);
    }
}

async function apiDeleteGlobalEvent(
    server: ServerDTO,
    eventName: string
): Promise<any> {
    const url = getRestUrl(server, BASE_PATH, 'deleteGlobalEvent');
    url.searchParams.set('eventName', eventName);

    return fetch(url, {
        method: 'DELETE',
        headers: buildHeaders(await loginAndGetCookies(server)),
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

    await saveFile(event.globalEventPK.eventId, event.eventDescription);
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

    const results = await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Importando Eventos Globais.', cancellable: false },
        progress => {
            const increment = 100 / eventList.length;
            let current = 0;
            progress.report({ increment: 0 });

            return Promise.all(
                eventList.map(async event => {
                    await saveFile(event.globalEventPK.eventId, event.eventDescription, false);
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

    const globalEvents = await apiGetEventList(server);
    const globalEventId = basename(fileUri.fsPath, '.js');

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

    const result: any = await apiSaveEventList(server, globalEvents);

    if (result?.content === 'OK') {
        markSynced(fileUri);
        window.showInformationMessage(`Evento Global ${globalEventId} exportado com sucesso!`);
    } else {
        markError(fileUri);
        window.showErrorMessage(
            `Falha ao exportar o Evento Global ${globalEventId}!\n${result?.message?.message}`
        );
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

export async function saveFile(name: string, content: string, openFile = true): Promise<void> {
    const uri = Uri.joinPath(getWorkspaceUri(), 'events', `${name}.js`);
    await workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));

    if (openFile) {
        window.showTextDocument(uri);
        window.showInformationMessage(`Evento global ${name} importado com sucesso!`);
    }
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

// ── Internal ───────────────────────────────────────────────────────────────

function buildHeaders(cookies: string): Headers {
    return new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: cookies,
    });
}
