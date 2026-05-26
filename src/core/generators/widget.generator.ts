import { Uri, window, workspace } from 'vscode';
import { readFileSync } from 'fs';
import { getWorkspaceUri } from '../workspace.utils';
import { TemplateService } from '../template.service';

export async function createWidget(): Promise<void> {
    const widgetName = (await window.showInputBox({
        prompt: 'Qual o nome do Widget (sem espaços e sem caracteres especiais)?',
        placeHolder: 'NomeWidget',
    })) || '';

    if (!widgetName) {
        return;
    }

    const widgetUriFile = Uri.joinPath(
        getWorkspaceUri(),
        'wcm', 'widget', widgetName, 'src', 'main', 'resources', 'view.ftl'
    );

    try {
        await workspace.fs.stat(widgetUriFile);
        void window.showTextDocument(widgetUriFile);
        return;
    } catch {
        // não existe, seguir com a criação
    }

    const widgetUri = Uri.joinPath(getWorkspaceUri(), 'wcm', 'widget', widgetName);
    await workspace.fs.copy(Uri.joinPath(TemplateService.templatesUri, 'widget'), widgetUri);

    const baseResourcesUri = Uri.joinPath(widgetUri, 'src', 'main', 'resources');
    const baseWebAppUri = Uri.joinPath(widgetUri, 'src', 'main', 'webapp');
    const propertiesTemplate = Uri.joinPath(baseResourcesUri, 'widgetname.properties');

    const propertiesLangs = ['en_US', 'es', 'pt_BR'];

    await Promise.all([
        ...propertiesLangs.map(lang =>
            workspace.fs.copy(
                propertiesTemplate,
                Uri.joinPath(baseResourcesUri, `${widgetName}_${lang}.properties`)
            )
        ),
        workspace.fs.rename(
            Uri.joinPath(baseWebAppUri, 'resources', 'css', 'widgetname.css'),
            Uri.joinPath(baseWebAppUri, 'resources', 'css', `${widgetName}.css`)
        ),
        workspace.fs.rename(
            Uri.joinPath(baseWebAppUri, 'resources', 'js', 'widgetname.js'),
            Uri.joinPath(baseWebAppUri, 'resources', 'js', `${widgetName}.js`)
        ),
    ]);

    const replace = (path: Uri) =>
        workspace.fs.writeFile(
            path,
            Buffer.from(readFileSync(path.fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
        );

    await Promise.all([
        replace(Uri.joinPath(baseWebAppUri, 'WEB-INF', 'jboss-web.xml')),
        replace(Uri.joinPath(baseResourcesUri, 'application.info')),
        replace(Uri.joinPath(baseResourcesUri, 'edit.ftl')),
        replace(Uri.joinPath(baseResourcesUri, 'view.ftl')),
        replace(Uri.joinPath(baseWebAppUri, 'resources', 'js', `${widgetName}.js`)),
        workspace.fs.rename(
            propertiesTemplate,
            Uri.joinPath(baseResourcesUri, `${widgetName}.properties`)
        ),
    ]);

    window.showTextDocument(widgetUriFile);
}
