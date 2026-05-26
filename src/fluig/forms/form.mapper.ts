import { ExtensionContext } from 'vscode';
import { ServerDTO } from '../../types/server.types';
import { DocumentDTO, FormDTO } from './form.types';
import { getLastParentDocumentId, updateLastParentDocumentId } from '../../core/global-storage';
import { window } from 'vscode';

export async function buildCreateFormParams(
    context: ExtensionContext,
    server: ServerDTO,
    formName: string
): Promise<FormDTO | null> {
    const newFormName =
        (await window.showInputBox({ prompt: 'Qual o nome do Formulário?', value: formName })) || '';
    if (!newFormName) {
        return null;
    }

    const newDatasetName =
        (await window.showInputBox({
            prompt: 'Qual o nome do Dataset do Formulário?',
            value: `ds_${newFormName}`,
        })) || '';
    if (!newDatasetName) {
        return null;
    }

    const parentDocumentId =
        (await window.showInputBox({
            prompt: 'Qual o id da Pasta onde irá salvar o Formulário?',
            value: getLastParentDocumentId(context, server),
        })) || '';
    if (!parentDocumentId) {
        return null;
    }
    updateLastParentDocumentId(context, server, parentDocumentId);

    const persistenceType = await window.showQuickPick(
        [
            { label: 'Tabelas de Banco de Dados (recomendado)', value: 1 },
            { label: 'Numa única tabela (pequena quantidade de registros)', value: 0 },
        ],
        { placeHolder: 'Tipo de Armazenamento?' }
    );
    if (!persistenceType) {
        return null;
    }

    const cardDescription =
        (await window.showInputBox({
            prompt: 'Nome do campo descritor (deixe em branco para usar o padrão)',
            value: '',
        })) || '';

    return {
        username: server.username,
        password: server.password,
        companyId: server.companyId,
        publisherId: server.userCode,
        parentDocumentId: parseInt(parentDocumentId),
        documentDescription: newFormName,
        cardDescription,
        datasetName: newDatasetName,
        Attachments: { item: [] },
        customEvents: { item: [] },
        persistenceType: persistenceType.value,
    };
}

export async function buildUpdateFormParams(
    server: ServerDTO,
    selectedForm: DocumentDTO
): Promise<FormDTO | null> {
    const newDatasetName =
        (await window.showInputBox({
            prompt: 'Qual o nome do Dataset do Formulário?',
            value: selectedForm.datasetName,
        })) || '';
    if (!newDatasetName) {
        return null;
    }

    const versionOption = await window.showQuickPick(
        [
            { label: 'Manter Versão', value: '0' },
            { label: 'Criar Nova Versão', value: '2' },
        ],
        { placeHolder: 'Controle de Versão' }
    );
    if (!versionOption) {
        return null;
    }

    const descriptionField =
        (await window.showInputBox({
            prompt: 'Nome do campo descritor (deixe em branco para usar o padrão)',
            value: selectedForm.cardDescription,
        })) || '';

    return {
        username: server.username,
        password: server.password,
        companyId: server.companyId,
        publisherId: server.userCode,
        documentId: selectedForm.documentId,
        descriptionField,
        cardDescription: selectedForm.documentDescription,
        datasetName: newDatasetName,
        Attachments: { item: [] },
        customEvents: { item: [] },
        generalInfo: { versionOption: versionOption.value },
    };
}
