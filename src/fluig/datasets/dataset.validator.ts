import { window } from 'vscode';
import { DatasetDTO } from './dataset.types';

/**
 * Solicita ao usuário um ID de dataset único (sem espaços), repetindo enquanto já existir.
 * Retorna undefined se o usuário cancelar.
 */
export async function promptUniqueDatasetId(
    existingDatasets: DatasetDTO[],
    serverName: string,
    initialValue: string = ''
): Promise<string | undefined> {
    let datasetId = initialValue;
    let alreadyExists = false;

    do {
        datasetId =
            (await window.showInputBox({
                prompt: 'Qual o nome do Dataset (sem espaços e sem caracteres especiais)?',
                placeHolder: 'ds_nome_dataset',
                value: datasetId,
            })) || '';

        if (!datasetId) {
            return undefined;
        }

        alreadyExists =
            existingDatasets.find(ds => ds.datasetId === datasetId) !== undefined;

        if (alreadyExists) {
            window.showWarningMessage(
                `O dataset "${datasetId}" já existe no servidor "${serverName}"!`
            );
        }
    } while (alreadyExists);

    return datasetId;
}
