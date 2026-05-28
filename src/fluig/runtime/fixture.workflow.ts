import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Uri } from 'vscode';
import { getWorkspaceUri } from '../../core/workspace.utils';
import { WorkflowContext } from './mocks/workflow.mock';

const DEFAULT_CONTEXT: WorkflowContext = {
    processId: 'MEU_PROCESSO',
    processInstanceId: '1001',
    activityId: '1',
    colleagueId: 'adm',
    companyId: '1',
    cardId: '9999',
    version: '1',
    formId: 'FORM_PRINCIPAL',
    cardFields: {
        WKF_TITULO: 'Título do processo',
        WKF_STATUS: 'EM_ANDAMENTO',
    },
};

function mockDir(): string {
    return Uri.joinPath(getWorkspaceUri(), 'mock').fsPath;
}

export function loadWorkflowContextFixture(warn: (msg: string) => void): WorkflowContext {
    const filePath = join(mockDir(), 'workflow-context.json');
    if (!existsSync(filePath)) {
        warn('Fixture não encontrada: mock/workflow-context.json — usando contexto padrão. Edite o arquivo para personalizar.');
        return { ...DEFAULT_CONTEXT };
    }
    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
        return { ...DEFAULT_CONTEXT, ...parsed };
    } catch (err: any) {
        warn(`Erro ao ler mock/workflow-context.json: ${err.message} — usando contexto padrão`);
        return { ...DEFAULT_CONTEXT };
    }
}

export function scaffoldWorkflowMockDir(): void {
    const dir = mockDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const filePath = join(dir, 'workflow-context.json');
    if (existsSync(filePath)) {
        return;
    }
    writeFileSync(
        filePath,
        JSON.stringify(
            {
                ...DEFAULT_CONTEXT,
                _instrucoes: [
                    'Edite este arquivo para simular o contexto do processo durante a execução local.',
                    'cardFields: campos do formulário acessíveis via getValue() / setValue().',
                    'movementSequence: sequência de movimento passada para beforeMovementOptions.',
                ],
            },
            null,
            2
        ),
        'utf-8'
    );
}
