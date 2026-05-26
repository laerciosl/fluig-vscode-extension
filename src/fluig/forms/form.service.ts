import { ExtensionContext, Uri, window, workspace, ProgressLocation } from 'vscode';
import { readFileSync } from 'fs';
import { basename, parse } from 'path';
import { glob } from 'glob';
import { ServerDTO } from '../../types/server.types';
import { DocumentDTO, FormDTO, AttachmentDTO, CustomizationEventsDTO } from './form.types';
import { buildCreateFormParams, buildUpdateFormParams } from './form.mapper';
import { getWorkspaceUri, confirmPassword } from '../../core/workspace.utils';
import { getSelect } from '../../core/server.service';
import { createAuthenticatedClientAsync, getHost } from '@fluiggers/sdk';

function getServiceUri(server: ServerDTO): string {
    return `${getHost(server)}/webdesk/ECMCardIndexService?wsdl`;
}

// ── Queries ────────────────────────────────────────────────────────────────

export function getForms(server: ServerDTO): Promise<DocumentDTO[]> {
    const params = {
        companyId: server.companyId,
        username: server.username,
        password: server.password,
        colleagueId: server.userCode,
    };

    return createAuthenticatedClientAsync(server, getServiceUri(server))
        .then(client => client.getCardIndexesWithoutApproverAsync(params))
        .then(response => response[0]?.result?.item || []);
}

export function getFileNames(server: ServerDTO, documentId: number): Promise<string[]> {
    const params = {
        username: server.username,
        password: server.password,
        companyId: server.companyId,
        documentId,
        colleagueId: server.userCode,
    };

    return createAuthenticatedClientAsync(server, getServiceUri(server))
        .then(client => client.getAttachmentsListAsync(params))
        .then(response => response[0]?.result?.item || [])
        .then(items => (Array.isArray(items) ? items : [items]));
}

export function getFileBase64(
    server: ServerDTO,
    documentId: number,
    version: number,
    fileName: string
): Promise<string> {
    const params = {
        username: server.username,
        password: server.password,
        companyId: server.companyId,
        documentId,
        colleagueId: server.userCode,
        version,
        nomeArquivo: fileName,
    };

    return createAuthenticatedClientAsync(server, getServiceUri(server))
        .then(client => client.getCardIndexContentAsync(params))
        .then(response => response[0].folder);
}

export function getCustomizationEvents(
    server: ServerDTO,
    documentId: number
): Promise<CustomizationEventsDTO[]> {
    const params = {
        username: server.username,
        password: server.password,
        companyId: server.companyId,
        documentId,
    };

    return createAuthenticatedClientAsync(server, getServiceUri(server))
        .then(client => client.getCustomizationEventsAsync(params))
        .then(response => response[0]?.result?.item || [])
        .then(items => (Array.isArray(items) ? items : [items]));
}

// ── Import ─────────────────────────────────────────────────────────────────

export async function importOne(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const form = await pickForm(server);
    if (!form) {
        return;
    }

    await writeFormFiles(server, form, getWorkspaceUri());
    window.showInformationMessage('O formulário foi importado!');
}

export async function importMany(): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    const forms = await pickManyForms(server);
    if (!forms?.length) {
        return;
    }

    const workspaceUri = getWorkspaceUri();

    const results = await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Importando Formulários.', cancellable: false },
        progress => {
            const increment = 100 / forms.length;
            let current = 0;
            progress.report({ increment: 0 });

            return Promise.all(
                forms.map(async form => {
                    if (!form) {
                        return;
                    }
                    await writeFormFiles(server, form, workspaceUri);
                    current += increment;
                    progress.report({ increment: current });
                    return true;
                })
            );
        }
    );

    window.showInformationMessage(`${results.length} formulários foram importados.`);
}

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportOne(context: ExtensionContext, fileUri: Uri): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    const formFolderName = fileUri.path.replace(/.*\/forms\/([^/]+).*/, '$1');
    const formName = formFolderName.replace(/^(?:\d+ - )?(\w+)$/, '$1');

    const selectedForm = await pickExportTarget(server, formName);
    if (!selectedForm) {
        return;
    }

    const params =
        selectedForm === 'novo'
            ? await buildCreateFormParams(context, server, formName)
            : await buildUpdateFormParams(server, selectedForm);

    if (params === null) {
        return;
    }

    const formFolder = Uri.joinPath(getWorkspaceUri(), 'forms', formFolderName).fsPath;
    const isEvent = /[/\\]events$/;

    for (const attachmentPath of glob.sync(`${formFolder}/**/*.*`, {
        nodir: true,
        ignore: { ignored: path => isEvent.test(path.parentPath) },
    })) {
        const pathParsed = parse(attachmentPath);
        const attachment: AttachmentDTO = {
            fileName: pathParsed.base,
            filecontent: readFileSync(attachmentPath).toString('base64'),
            principal: pathParsed.ext.toLowerCase().includes('htm') && formName === pathParsed.name,
        };
        params.Attachments.item.push(attachment);
    }

    for (const eventPath of glob.sync(`${formFolder}/events/*.js`)) {
        const customEvent: CustomizationEventsDTO = {
            eventDescription: readFileSync(eventPath).toString('utf-8'),
            eventId: basename(eventPath, '.js'),
            eventVersAnt: false,
        };
        params.customEvents.item.push(customEvent);
    }

    try {
        const client = await createAuthenticatedClientAsync(server, getServiceUri(server));
        const response =
            selectedForm === 'novo'
                ? await client.createSimpleCardIndexWithDatasetPersisteTypeAsync(params)
                : await client.updateSimpleCardIndexWithDatasetAndGeneralInfoAsync(params);

        const message = response[0]?.result?.item?.webServiceMessage;
        if (message === 'ok') {
            window.showInformationMessage(`Formulário ${formName} exportado com sucesso!`);
        } else {
            window.showErrorMessage(
                message || 'Verifique o id da Pasta onde irá salvar o Formulário!'
            );
        }
    } catch {
        window.showErrorMessage('Erro ao exportar Formulário.');
    }
}

// ── QuickPick helpers ──────────────────────────────────────────────────────

export async function pickForm(server: ServerDTO): Promise<DocumentDTO | undefined> {
    const forms = await getForms(server);
    const items = forms.map(f => ({
        label: `${f.documentId} - ${f.documentDescription}`,
        detail: f.datasetName,
    }));

    const result = await window.showQuickPick(items, { placeHolder: 'Selecione o formulário' });
    if (!result) {
        return undefined;
    }

    const id = result.label.substring(0, result.label.indexOf(' - '));
    return forms.find(f => f.documentId.toString() === id);
}

export async function pickManyForms(
    server: ServerDTO
): Promise<(DocumentDTO | undefined)[] | undefined> {
    const forms = await getForms(server);
    const items = forms.map(f => ({
        label: `${f.documentId} - ${f.documentDescription}`,
        detail: f.datasetName,
    }));

    const result = await window.showQuickPick(items, {
        placeHolder: 'Selecione o formulário',
        canPickMany: true,
    });
    if (!result) {
        return undefined;
    }

    return result.map(item => {
        const id = item.label.substring(0, item.label.indexOf(' - '));
        return forms.find(f => f.documentId.toString() === id);
    });
}

// ── Internal ───────────────────────────────────────────────────────────────

async function writeFormFiles(
    server: ServerDTO,
    form: DocumentDTO,
    workspaceUri: Uri
): Promise<void> {
    const folderUri = Uri.joinPath(workspaceUri, 'forms', form.documentDescription);
    const fileNames = await getFileNames(server, form.documentId);

    for (const fileName of fileNames) {
        const base64 = await getFileBase64(server, form.documentId, form.version, fileName);
        if (base64) {
            workspace.fs.writeFile(
                Uri.joinPath(folderUri, fileName),
                Buffer.from(Buffer.from(base64, 'base64').toString('utf-8'), 'utf-8')
            );
        }
    }

    const eventsUri = Uri.joinPath(folderUri, 'events');
    const events = await getCustomizationEvents(server, form.documentId);

    for (const event of events) {
        workspace.fs.writeFile(
            Uri.joinPath(eventsUri, `${event.eventId}.js`),
            Buffer.from(event.eventDescription, 'utf-8')
        );
    }
}

async function pickExportTarget(
    server: ServerDTO,
    formNameOrId: string | number
): Promise<DocumentDTO | 'novo' | undefined> {
    const forms = await getForms(server);
    const items: { label: string; detail?: string }[] = [];
    let selected: { label: string; detail: string } | null = null;

    for (const form of forms) {
        if (formNameOrId === form.documentId || formNameOrId === form.documentDescription) {
            selected = {
                label: `${form.documentId} - ${form.documentDescription}`,
                detail: form.datasetName,
            };
        } else {
            items.push({
                label: `${form.documentId} - ${form.documentDescription}`,
                detail: form.datasetName,
            });
        }
    }

    items.unshift({ label: 'Novo Formulário' });
    if (selected) {
        items.unshift(selected);
    }

    const result = await window.showQuickPick(items, {
        placeHolder: 'Criar ou Editar formulário?',
    });

    if (!result) {
        return undefined;
    }

    if (result.label === 'Novo Formulário') {
        return 'novo';
    }

    const id = result.label.substring(0, result.label.indexOf(' - '));
    return forms.find(f => f.documentId.toString() === id);
}
