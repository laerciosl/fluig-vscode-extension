import { MockDataset } from './dataset-factory.mock';

type FixtureLoader = {
    cards: (formId: string) => any[];
    dataset: (datasetId: string) => MockDataset;
};

export function buildHAPI(fixtures: FixtureLoader, log: (msg: string) => void): object {
    return {
        findCardValue(formId: string, _constraints: any[], _sortFields: string[]): any[] {
            log(`hAPI.findCardValue('${formId}', ...)`);
            return fixtures.cards(formId);
        },

        getCardValue(formId: string, cardId: string | number): any {
            log(`hAPI.getCardValue('${formId}', ${cardId})`);
            return fixtures.cards(formId)[0] ?? {};
        },

        getDatasetValues(datasetId: string, _fields: any, _constraints: any, _sortFields: any): MockDataset {
            log(`hAPI.getDatasetValues('${datasetId}', ...)`);
            return fixtures.dataset(datasetId);
        },

        getCurrentUserLogin: () => 'fluig.dev',
        getCurrentUserCode: () => 'adm',
        getCurrentTenantId: () => '1',

        getColleagueByLogin(login: string): object {
            log(`hAPI.getColleagueByLogin('${login}')`);
            return { login, colleagueName: login, active: true };
        },

        getGroupByCode(code: string): object {
            log(`hAPI.getGroupByCode('${code}')`);
            return { groupId: code, groupDescription: code };
        },

        getUsersByGroup(groupCode: string): any[] {
            log(`hAPI.getUsersByGroup('${groupCode}')`);
            return [];
        },
    };
}
