import { MockDataset } from './dataset-factory.mock';

type FixtureLoader = {
    cards: (formId: string) => any[];
    dataset: (datasetId: string) => MockDataset;
};

export function buildHAPI(fixtures: FixtureLoader, log: (msg: string) => void): object {
    let _nextCardId = 90000;
    let _seqCounters: Record<string, number> = {};

    return {
        // ── Card ──────────────────────────────────────────────────────────────

        findCardValue(formId: string, _constraints: any[], _sortFields: string[]): any[] {
            log(`hAPI.findCardValue('${formId}', ...)`);
            return fixtures.cards(formId);
        },

        getCardValue(formId: string, cardId: string | number): any {
            log(`hAPI.getCardValue('${formId}', ${cardId})`);
            return fixtures.cards(formId)[0] ?? {};
        },

        createCardData(formId: string, _cardData: any): any {
            const newId = String(++_nextCardId);
            log(`hAPI.createCardData('${formId}') → cardId=${newId}`);
            return { codCard: newId };
        },

        updateCardData(formId: string, cardId: string | number, _cardData: any): any {
            log(`hAPI.updateCardData('${formId}', ${cardId})`);
            return { codCard: String(cardId) };
        },

        getCardChildren(formId: string, cardId: string | number, childFormId: string): any[] {
            log(`hAPI.getCardChildren('${formId}', ${cardId}, '${childFormId}')`);
            return [];
        },

        // ── Dataset ───────────────────────────────────────────────────────────

        getDatasetValues(datasetId: string, _fields: any, _constraints: any, _sortFields: any): MockDataset {
            log(`hAPI.getDatasetValues('${datasetId}', ...)`);
            return fixtures.dataset(datasetId);
        },

        // ── Usuários e grupos ─────────────────────────────────────────────────

        getCurrentUserLogin: () => 'fluig.dev',
        getCurrentUserCode: () => 'adm',
        getCurrentTenantId: () => '1',

        getColleagueByLogin(login: string): object {
            log(`hAPI.getColleagueByLogin('${login}')`);
            return { login, colleagueName: login, active: true };
        },

        getUserByLogin(login: string): object {
            log(`hAPI.getUserByLogin('${login}')`);
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

        getUsersByRole(roleId: string): any[] {
            log(`hAPI.getUsersByRole('${roleId}') → []`);
            return [];
        },

        getRoleByCode(roleCode: string): object {
            log(`hAPI.getRoleByCode('${roleCode}')`);
            return { roleId: roleCode, roleDescription: roleCode };
        },

        // ── Sequências ────────────────────────────────────────────────────────

        getSequenceCode(seqId: string): number {
            _seqCounters[seqId] = (_seqCounters[seqId] ?? 0) + 1;
            log(`hAPI.getSequenceCode('${seqId}') → ${_seqCounters[seqId]}`);
            return _seqCounters[seqId];
        },

        // ── Notificações ──────────────────────────────────────────────────────

        sendNotification(subject: string, _from: string, to: string, _msg: string): boolean {
            log(`hAPI.sendNotification('${subject}', to='${to}')`);
            return true;
        },

        notifyUser(to: string, _from: string, subject: string, _msg: string): void {
            log(`hAPI.notifyUser(to='${to}', subject='${subject}')`);
        },
    };
}
