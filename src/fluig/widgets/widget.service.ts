import { Uri, window, workspace, FileType, ProgressLocation } from 'vscode';
import { readFileSync } from 'fs';
import { glob } from 'glob';
import { basename } from 'path';
import * as JSZip from 'jszip';
import { ServerDTO } from '../../types/server.types';
import { WidgetFluiggersDTO } from './widget.types';
import { getWorkspaceUri, confirmPassword } from '../../core/workspace.utils';
import { getSelect } from '../../core/server.service';
import { Server } from '../../core/server.model';
import { logInfo } from '../../core/output';
import { emitSuccess, emitError } from '../../core/event-bus';
import { fetchWithAuth, loginAndGetCookies, getHost, validateServerHasFluiggersWidget } from '@fluiggers/sdk';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportWidget(fileUri: Uri): Promise<void> {
    const server = await getSelect();
    if (!server) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    const widgetName = fileUri.path.replace(/.*\/widget\/([^/]+).*/, '$1');
    logInfo(`Exportando widget: ${widgetName} → ${server.name}`);
    const widgetUri = Uri.joinPath(getWorkspaceUri(), 'wcm', 'widget', widgetName);
    const zipStream = new JSZip();
    zipStream.folder('WEB-INF');
    zipStream.folder('WEB-INF/classes');

    for (const filePath of glob.sync(
        Uri.joinPath(widgetUri, 'src', 'main', 'webapp', 'WEB-INF').fsPath + '/*.xml'
    )) {
        zipStream.file('WEB-INF/' + basename(filePath), readFileSync(filePath, 'utf8'));
    }

    for (const filePath of glob.sync(
        Uri.joinPath(widgetUri, 'src', 'main', 'resources').fsPath + '/*.*'
    )) {
        zipStream.file('WEB-INF/classes/' + basename(filePath), readFileSync(filePath, 'utf8'));
    }

    await addFolderFiles(
        zipStream,
        Uri.joinPath(widgetUri, 'src', 'main', 'webapp', 'resources'),
        'resources'
    );

    try {
        const content = await zipStream.generateAsync({
            type: 'uint8array',
            compression: 'STORE',
            mimeType: 'application/java-archive',
        });
        const response: any = await uploadWarFile(server, `${widgetName}.war`, content);

        if (response.message) {
            emitError({
                kind: 'widget',
                operation: 'export',
                name: widgetName,
                serverName: server.name,
                uri: fileUri,
                error: response.message.message,
            });
        } else {
            emitSuccess({ kind: 'widget', operation: 'export', name: widgetName, serverName: server.name, uri: fileUri });
        }
    } catch (error: any) {
        emitError({
            kind: 'widget',
            operation: 'export',
            name: widgetName,
            serverName: server.name,
            uri: fileUri,
            error: error.message || String(error),
        });
    }
}

export async function exportFluiggersWidget(serverDto?: ServerDTO): Promise<void> {
    const server = serverDto ? new Server(serverDto) : await getSelect();
    if (!server) {
        return;
    }

    if (server.confirmExporting && !(await confirmPassword(server))) {
        return;
    }

    logInfo(`Instalando FluiggersWidget → ${server.name}`);
    try {
        const downloaded = await fetch(
            'https://raw.githubusercontent.com/fluiggers/fluig-widget-helper/refs/heads/master/target/fluiggersWidget.war'
        );

        if (!downloaded.ok || !downloaded.body) {
            throw new Error('Não foi possível baixar a widget do GitHub');
        }

        const response: any = await uploadWarFile(
            server,
            'fluiggersWidget.war',
            await downloaded.blob()
        );

        if (response.message) {
            emitError({
                kind: 'widget',
                operation: 'export',
                name: 'fluiggersWidget',
                serverName: server.name,
                error: response.message.message,
            });
        } else {
            emitSuccess({ kind: 'widget', operation: 'export', name: 'fluiggersWidget', serverName: server.name });
        }
    } catch (error: any) {
        emitError({
            kind: 'widget',
            operation: 'export',
            name: 'fluiggersWidget',
            serverName: server.name,
            error: error.message || String(error),
        });
    }
}

// ── Tree-based import (pre-resolved item, no QuickPick) ───────────────────

export async function importWidgetFromTree(server: ServerDTO, widget: WidgetFluiggersDTO): Promise<void> {
    logInfo(`Importando widget: ${widget.code} ← ${server.name}`);
    const widgetUri = Uri.joinPath(getWorkspaceUri(), 'wcm', 'widget', widget.code);

    try {
        await workspace.fs.delete(widgetUri, { recursive: true, useTrash: true });
    } catch {
        // widget not present locally — ok
    }

    const zipFile = await JSZip.loadAsync(await downloadWidgetFile(server, widget.filename));
    zipFile.forEach(async (relativePath, file) => {
        if (file.dir) {
            return;
        }
        const fileUri = resolveImportUri(widgetUri, relativePath);
        if (!fileUri) {
            return;
        }
        try {
            await workspace.fs.writeFile(fileUri, await file.async('uint8array'));
        } catch (err: any) {
            window.showWarningMessage(err);
        }
    });

    emitSuccess({ kind: 'widget', operation: 'import', name: widget.code, serverName: server.name });
}

// ── Import ─────────────────────────────────────────────────────────────────

export async function importWidget(): Promise<void> {
    try {
        const server = await getSelect();
        if (!server) {
            return;
        }

        const cookies = await loginAndGetCookies(server);
        await validateServerHasFluiggersWidget(server, cookies);

        const widgets = await pickWidgets(server);
        if (!widgets?.length) {
            return;
        }

        logInfo(`Importando ${widgets.length} widget(s) ← ${server.name}`);
        const results = await window.withProgress(
            { location: ProgressLocation.Notification, title: 'Importando Widgets.', cancellable: false },
            progress => {
                const increment = 100 / widgets.length;
                let current = 0;
                progress.report({ increment: 0 });

                return Promise.all(
                    widgets.map(async widget => {
                        try {
                            const zipFile = await JSZip.loadAsync(
                                await downloadWidgetFile(server, widget.filename)
                            );
                            const widgetUri = Uri.joinPath(
                                getWorkspaceUri(),
                                'wcm',
                                'widget',
                                widget.code
                            );

                            try {
                                await workspace.fs.delete(widgetUri, {
                                    recursive: true,
                                    useTrash: true,
                                });
                            } catch (err: any) {
                                window.showWarningMessage(err);
                            }

                            zipFile.forEach(async (relativePath, file) => {
                                if (file.dir) {
                                    return;
                                }
                                const fileUri = resolveImportUri(widgetUri, relativePath);
                                if (!fileUri) {
                                    return;
                                }
                                try {
                                    await workspace.fs.writeFile(
                                        fileUri,
                                        await file.async('uint8array')
                                    );
                                } catch (err: any) {
                                    window.showWarningMessage(err);
                                }
                            });

                            emitSuccess({ kind: 'widget', operation: 'import', name: widget.code, serverName: server.name, silent: true });
                            return true;
                        } catch (error: any) {
                            emitError({ kind: 'widget', operation: 'import', name: widget.code, serverName: server.name, error: error.message || String(error), silent: true });
                            return false;
                        } finally {
                            current += increment;
                            progress.report({ increment: current });
                        }
                    })
                );
            }
        );

        const successCount = results.filter(Boolean).length;
        window.showInformationMessage(
            successCount > 1
                ? `${successCount} widgets foram importadas.`
                : '1 widget foi importada.'
        );
    } catch (error: any) {
        window.showErrorMessage(error.message || error);
    }
}

// ── API helpers ────────────────────────────────────────────────────────────

export async function getWidgets(server: ServerDTO): Promise<WidgetFluiggersDTO[]> {
    const cookies = await loginAndGetCookies(server);

    try {
        await validateServerHasFluiggersWidget(server, cookies);
    } catch {
        return [];
    }

    return fetchWithAuth(server, `${getHost(server)}/fluiggersWidget/api/widgets`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    }).then(r => r.json() as Promise<WidgetFluiggersDTO[]>);
}

export async function downloadWidgetFile(
    server: ServerDTO,
    widgetFileName: string
): Promise<ArrayBuffer> {
    return fetchWithAuth(
        server,
        `${getHost(server)}/fluiggersWidget/api/widgets/${widgetFileName}`,
        { method: 'GET' }
    ).then(async r => {
        if (r.status !== 200) {
            throw `${widgetFileName}: ${await r.text()}`;
        }
        return r.arrayBuffer();
    });
}

async function pickWidgets(server: ServerDTO): Promise<WidgetFluiggersDTO[]> {
    const widgets = await getWidgets(server);
    const items = widgets.map(w => ({
        label: w.code,
        detail: `${w.title} - ${w.description}`,
    }));

    const result = await window.showQuickPick(items, {
        placeHolder: 'Selecione as widgets para importar',
        canPickMany: true,
    });

    if (!result) {
        return [];
    }

    return result
        .map(item => widgets.find(w => w.code === item.label))
        .filter((w): w is WidgetFluiggersDTO => w !== undefined);
}

async function uploadWarFile(
    server: ServerDTO,
    fileName: string,
    content: Uint8Array | Blob
): Promise<any> {
    const url = `${getHost(server)}/portal/api/rest/wcmservice/rest/product/uploadfile`;
    const formData = new FormData();
    formData.append('fileName', fileName);
    formData.append('fileDescription', 'WCM Eclipse Plugin Deploy Artifact');
    formData.append(
        'attachment',
        content instanceof Blob ? content : new Blob([content]),
        fileName
    );

    return fetchWithAuth(server, url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
    }).then(r => {
        if (!r.ok) {
            throw new Error(`${r.status} - ${r.statusText}.`);
        }
        return r.json();
    });
}

async function addFolderFiles(
    zipStream: JSZip,
    folder: Uri,
    zipFolder: string
): Promise<void> {
    zipStream.folder(zipFolder);
    for (const [name, type] of await workspace.fs.readDirectory(folder)) {
        const fileUri = Uri.joinPath(folder, name);
        const zipPath = `${zipFolder}/${name}`;
        if (type === FileType.Directory) {
            await addFolderFiles(zipStream, fileUri, zipPath);
        } else {
            zipStream.file(zipPath, await workspace.fs.readFile(fileUri), { binary: true });
        }
    }
}

/**
 * Resolve o caminho de destino dentro da estrutura Maven para um arquivo do ZIP.
 */
export function resolveImportUri(widgetUri: Uri, relativePath: string): Uri | null {
    if (relativePath.startsWith('resources/')) {
        return Uri.joinPath(
            Uri.joinPath(widgetUri, 'src', 'main', 'webapp'),
            ...relativePath.split('/')
        );
    }
    if (/^WEB-INF\/classes\/\w+\.\w+$/.test(relativePath)) {
        return Uri.joinPath(
            Uri.joinPath(widgetUri, 'src', 'main', 'resources'),
            relativePath.replace('WEB-INF/classes/', '')
        );
    }
    if (/^WEB-INF\/[\w-]+\.\w+$/.test(relativePath)) {
        return Uri.joinPath(
            Uri.joinPath(widgetUri, 'src', 'main', 'webapp'),
            ...relativePath.split('/')
        );
    }
    if (/^WEB-INF\/classes\/.+\/[\w-]+\.\w+$/.test(relativePath)) {
        return Uri.joinPath(
            Uri.joinPath(widgetUri, 'src', 'main', 'java'),
            ...relativePath.replace('WEB-INF/classes/', '').split('/')
        );
    }
    if (relativePath.endsWith('pom.xml')) {
        return Uri.joinPath(widgetUri, 'pom.xml');
    }
    return null;
}
