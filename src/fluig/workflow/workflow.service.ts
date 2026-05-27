import { Uri, window, workspace, ProgressLocation } from 'vscode';
import { basename } from 'path';
import { readFileSync } from 'fs';
import { glob } from 'glob';
import { ServerDTO } from '../../types/server.types';
import { AttributionMechanismDTO } from './workflow.types';
import { buildMechanismStructure, buildEventsPayload } from './workflow.mapper';
import { getWorkspaceUri, confirmPassword } from '../../core/workspace.utils';
import { markSynced, markError } from '../../core/sync-state';
import { getSelect } from '../../core/server.service';
import { logInfo } from '../../core/output';
import {
    loginAndGetCookies,
    getRestUrl,
    validateServerHasFluiggersWidget,
    apiGetLastWorkflowVersion,
    apiUpdateWorkflowEvents,
} from '@fluiggers/sdk';

const MECHANISM_BASE_PATH = '/ecm/api/rest/ecm/mechanism/';

// ── Workflow event export ──────────────────────────────────────────────────

export async function updateWorkflowEvents(eventUri: Uri): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const cookies = await loginAndGetCookies(server);

    try {
        await validateServerHasFluiggersWidget(server, cookies);
    } catch (error: any) {
        window.showErrorMessage(error.message || error);
        return;
    }

    const processId = eventUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, '$1');
    logInfo(`Exportando eventos do processo: ${processId} → ${server.name}`);
    const lastVersion = await apiGetLastWorkflowVersion(server, processId);

    if (lastVersion === 0) {
        window.showErrorMessage('Processo não foi encontrado no servidor Fluig.');
        return;
    }

    const versionToUpdate = parseInt(
        (await window.showInputBox({
            prompt: `Qual Versão do Processo pretende atualizar? (última versão: ${lastVersion})`,
            value: lastVersion.toString(),
        })) || '0'
    );

    if (versionToUpdate === 0) {
        return;
    }

    const multipleChoice = await window.showQuickPick(
        [
            { label: 'Não', value: false },
            { label: 'Sim', value: true },
        ],
        { placeHolder: 'Deseja atualizar múltiplos eventos?' }
    );

    if (!multipleChoice) {
        return;
    }

    const eventsToUpdate = multipleChoice.value
        ? await pickWorkflowEvents(processId)
        : [
              {
                  label: eventUri.path.replace(
                      /.*\/workflow\/scripts\/[^.]+\.([^.]+)\.js$/,
                      '$1'
                  ),
                  path: eventUri.fsPath,
              },
          ];

    if (!eventsToUpdate.length) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    try {
        const response = await apiUpdateWorkflowEvents(
            server,
            processId,
            versionToUpdate,
            buildEventsPayload(eventsToUpdate)
        );

        const eventUris = eventsToUpdate.map(e => Uri.file(e.path));
        if (!response.hasError) {
            eventUris.forEach(u => markSynced(u));
            window.showInformationMessage('Todos os eventos foram atualizados');
        } else {
            eventUris.forEach(u => markError(u));
            window.showWarningMessage('Ocorreram erros ao atualizar os eventos', {
                detail: response.errors.join('\n'),
                modal: true,
            });
        }
    } catch (error: any) {
        markError(eventUri);
        window.showErrorMessage(error.message || error);
    }
}

export async function pickWorkflowEvents(
    processId: string
): Promise<{ label: string; path: string }[]> {
    const eventsFolderUri = Uri.joinPath(getWorkspaceUri(), 'workflow', 'scripts');

    const allEvents = glob
        .sync(`${eventsFolderUri.fsPath}/${processId}.*.js`)
        .map(path => ({
            label: path.replace(/.*[/\\]+workflow[/\\]+scripts[/\\]+[^.]+\.([^.]+)\.js$/, '$1'),
            path,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    return (
        (await window.showQuickPick(allEvents, {
            placeHolder: 'Selecione os eventos para atualizar',
            canPickMany: true,
        })) || []
    );
}

// ── Attribution mechanisms ─────────────────────────────────────────────────

export async function getMechanisms(server: ServerDTO): Promise<AttributionMechanismDTO[]> {
    return apiListMechanisms(server);
}

async function apiListMechanisms(server: ServerDTO): Promise<AttributionMechanismDTO[]> {
    const url = getRestUrl(server, MECHANISM_BASE_PATH, 'getCustomAttributionMechanismList');

    try {
        const headers = buildJsonHeaders(await loginAndGetCookies(server));
        const response: any = await fetch(url, { headers }).then(r => r.json());

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

async function apiCreateMechanism(
    server: ServerDTO,
    mechanism: AttributionMechanismDTO
): Promise<any> {
    try {
        return await fetch(
            getRestUrl(server, MECHANISM_BASE_PATH, 'createAttributionMechanism'),
            {
                headers: buildJsonHeaders(await loginAndGetCookies(server)),
                method: 'POST',
                body: JSON.stringify(mechanism),
            }
        ).then(r => r.json());
    } catch (error) {
        return { message: { message: `Erro: ${error}` } };
    }
}

async function apiUpdateMechanism(
    server: ServerDTO,
    mechanism: AttributionMechanismDTO
): Promise<any> {
    try {
        return await fetch(
            getRestUrl(server, MECHANISM_BASE_PATH, 'updateAttributionMechanism'),
            {
                headers: buildJsonHeaders(await loginAndGetCookies(server)),
                method: 'POST',
                body: JSON.stringify(mechanism),
            }
        ).then(r => r.json());
    } catch (error) {
        return { message: { message: `Erro: ${error}` } };
    }
}

async function apiDeleteMechanism(server: ServerDTO, mechanismId: string): Promise<any> {
    const url = getRestUrl(server, MECHANISM_BASE_PATH, 'deleteAttributionMechanism', {
        mechanismId,
    });

    try {
        return await fetch(url, {
            headers: buildJsonHeaders(await loginAndGetCookies(server)),
            method: 'DELETE',
        }).then(r => r.json());
    } catch (error) {
        return { message: { message: `Erro: ${error}` } };
    }
}

export async function importMechanism(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const mechanism = await pickMechanism(server);
    if (!mechanism) {
        return;
    }

    await saveMechanismFile(
        mechanism.attributionMecanismPK.attributionMecanismId,
        mechanism.attributionMecanismDescription
    );
}

export async function importManyMechanisms(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const mechanisms = await pickManyMechanisms(server);
    if (!mechanisms?.length) {
        return;
    }

    const results = await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Importando Mecanismos Customizados.', cancellable: false },
        progress => {
            const increment = 100 / mechanisms.length;
            let current = 0;
            progress.report({ increment: 0 });

            return Promise.all(
                mechanisms.map(async m => {
                    await saveMechanismFile(
                        m.attributionMecanismPK.attributionMecanismId,
                        m.attributionMecanismDescription,
                        false
                    );
                    current += increment;
                    progress.report({ increment: current });
                    return true;
                })
            );
        }
    );

    window.showInformationMessage(`${results.length} Mecanismos Customizados foram importados.`);
}

export async function exportMechanism(fileUri: Uri): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const mechanisms = await apiListMechanisms(server);
    const items: { label: string; detail: string }[] = [];
    let mechanismSelected = { label: '', detail: '' };
    let mechanismId = basename(fileUri.fsPath, '.js');

    for (const m of mechanisms) {
        if (m.attributionMecanismPK.attributionMecanismId !== mechanismId) {
            items.push({ label: m.attributionMecanismPK.attributionMecanismId, detail: m.name });
        } else {
            mechanismSelected = {
                label: m.attributionMecanismPK.attributionMecanismId,
                detail: m.name,
            };
        }
    }

    items.unshift({ label: 'Novo Mecanismo Customizado', detail: '' });
    if (mechanismSelected.label) {
        items.unshift(mechanismSelected);
    }

    mechanismSelected =
        (await window.showQuickPick(items, {
            placeHolder: 'Criar ou Editar Mecanismo Customizado?',
        })) || { label: '', detail: '' };

    if (!mechanismSelected.label) {
        return;
    }

    const isNew = mechanismSelected.label === 'Novo Mecanismo Customizado';
    let mechanismStructure: AttributionMechanismDTO | undefined;

    if (isNew) {
        let exists = false;
        do {
            mechanismId =
                (await window.showInputBox({
                    prompt: 'Qual o código do Mecanismo Customizado (sem espaços e sem caracteres especiais)?',
                    placeHolder: 'mecanismo_customizado',
                    value: mechanismId,
                })) || '';

            if (!mechanismId) {
                return;
            }

            exists = mechanisms.some(
                m => m.attributionMecanismPK.attributionMecanismId === mechanismId
            );
            if (exists) {
                window.showWarningMessage(
                    `O mecanismo "${mechanismId}" já existe no servidor "${server.name}"!`
                );
            }
        } while (exists);

        mechanismStructure = buildMechanismStructure(server.companyId, mechanismId);
    } else {
        mechanismId = mechanismSelected.label;
        mechanismStructure = mechanisms.find(
            m => m.attributionMecanismPK.attributionMecanismId === mechanismId
        );
    }

    const name =
        (await window.showInputBox({
            prompt: 'Qual o nome do Mecanismo Customizado?',
            placeHolder: 'Nome do Mecanismo',
            value: mechanismStructure?.name || mechanismId,
        })) || '';

    const description =
        (await window.showInputBox({
            prompt: 'Qual a descrição do Mecanismo Customizado?',
            placeHolder: 'Descrição do Mecanismo',
            value: mechanismStructure?.description || mechanismId,
        })) || '';

    if (!mechanismStructure || !description || !name) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    logInfo(`Exportando mecanismo: ${mechanismId} → ${server.name}`);
    mechanismStructure.name = name;
    mechanismStructure.description = description;
    mechanismStructure.attributionMecanismDescription = readFileSync(fileUri.fsPath, 'utf8');

    const result: any = isNew
        ? await apiCreateMechanism(server, mechanismStructure)
        : await apiUpdateMechanism(server, mechanismStructure);

    if (result?.content === 'OK') {
        markSynced(fileUri);
        window.showInformationMessage(
            `Mecanismo Customizado ${mechanismId} exportado com sucesso!`
        );
    } else {
        markError(fileUri);
        window.showErrorMessage(
            `Falha ao exportar o Mecanismo Customizado ${mechanismId}!\n${result?.message?.message}`
        );
    }
}

async function pickMechanism(
    server: ServerDTO
): Promise<AttributionMechanismDTO | null> {
    const mechanisms = await apiListMechanisms(server);
    const items = mechanisms.map(m => ({
        label: m.attributionMecanismPK.attributionMecanismId,
        detail: m.name,
    }));
    const result = await window.showQuickPick(items, {
        placeHolder: 'Selecione o Mecanismo de Atribuição',
    });
    if (!result) {
        return null;
    }
    return (
        mechanisms.find(
            m => m.attributionMecanismPK.attributionMecanismId === result.label
        ) || null
    );
}

async function pickManyMechanisms(
    server: ServerDTO
): Promise<AttributionMechanismDTO[]> {
    const mechanisms = await apiListMechanisms(server);
    const items = mechanisms.map(m => ({
        label: m.attributionMecanismPK.attributionMecanismId,
        detail: m.name,
    }));
    const result = await window.showQuickPick(items, {
        placeHolder: 'Selecione o Mecanismo de Atribuição',
        canPickMany: true,
    });
    if (!result) {
        return [];
    }
    const selected = result.map(r => r.label);
    return mechanisms.filter(m =>
        selected.includes(m.attributionMecanismPK.attributionMecanismId)
    );
}

async function saveMechanismFile(
    name: string,
    content: string,
    openFile = true
): Promise<void> {
    const fileUri = Uri.joinPath(getWorkspaceUri(), 'mechanisms', `${name}.js`);
    await workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

    if (openFile) {
        window.showTextDocument(fileUri);
        window.showInformationMessage(`Mecanismo de Atribuição ${name} importado com sucesso!`);
    }
}

function buildJsonHeaders(cookies: string): Headers {
    return new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: cookies,
    });
}
