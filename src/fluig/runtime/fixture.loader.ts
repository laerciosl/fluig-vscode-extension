import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Uri } from 'vscode';
import { getWorkspaceUri } from '../../core/workspace.utils';
import { MockDataset } from './mocks/dataset-factory.mock';

function mockDir(): string {
    return Uri.joinPath(getWorkspaceUri(), 'mock').fsPath;
}

export function loadCardFixture(formId: string, warn: (msg: string) => void): any[] {
    const filePath = join(mockDir(), 'cards', `${formId}.json`);
    if (!existsSync(filePath)) {
        warn(`Fixture não encontrada: mock/cards/${formId}.json — retornando []`);
        return [];
    }
    try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        return Array.isArray(data) ? data : [data];
    } catch (err: any) {
        warn(`Erro ao ler mock/cards/${formId}.json: ${err.message}`);
        return [];
    }
}

export function loadDatasetFixture(datasetId: string, warn: (msg: string) => void): MockDataset {
    const ds = new MockDataset();
    const filePath = join(mockDir(), 'datasets', `${datasetId}.json`);
    if (!existsSync(filePath)) {
        warn(`Fixture não encontrada: mock/datasets/${datasetId}.json — retornando vazio`);
        return ds;
    }
    try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        (data.columns as string[] ?? []).forEach((col: string) => ds.addColumn(col));
        (data.rows as any[][] ?? []).forEach((row: any[]) => ds.addRow(row));
        return ds;
    } catch (err: any) {
        warn(`Erro ao ler mock/datasets/${datasetId}.json: ${err.message}`);
        return ds;
    }
}

export function scaffoldMockDir(): void {
    const dir = mockDir();
    const cardsDir = join(dir, 'cards');
    const datasetsDir = join(dir, 'datasets');

    for (const d of [dir, cardsDir, datasetsDir]) {
        if (!existsSync(d)) {
            require('fs').mkdirSync(d, { recursive: true });
        }
    }

    const readme = join(dir, 'README.md');
    if (!existsSync(readme)) {
        readFileSync; // noop to keep import
        require('fs').writeFileSync(
            readme,
            [
                '# Fixtures do Runtime Local',
                '',
                '## cards/',
                'Arquivos JSON com dados de formulários. Nome do arquivo = código do formulário.',
                '',
                'Exemplo `mock/cards/FORM_USUARIO.json`:',
                '```json',
                '[{ "login": "adm", "nome": "Administrador" }]',
                '```',
                '',
                '## datasets/',
                'Arquivos JSON com retorno de outros datasets.',
                '',
                'Exemplo `mock/datasets/dsEmpresa.json`:',
                '```json',
                '{ "columns": ["codigo", "nome"], "rows": [["1", "ACME"]] }',
                '```',
            ].join('\n')
        );
    }
}
