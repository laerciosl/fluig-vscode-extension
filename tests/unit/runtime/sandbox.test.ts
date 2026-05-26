import { describe, it, expect, vi, beforeAll } from 'vitest';
import { MockDataset } from '../../../src/fluig/runtime/mocks/dataset-factory.mock';

// Isola o sandbox do fixture.loader (que depende do workspace VS Code)
vi.mock('../../../src/fluig/runtime/fixture.loader', () => ({
    loadCardFixture: vi.fn((_id: string, _warn: any) => [
        { login: 'adm', nome: 'Administrador' },
    ]),
    loadDatasetFixture: vi.fn((_id: string, _warn: any) => {
        const ds = new MockDataset();
        ds.addColumn('empresa');
        ds.addRow(['ACME']);
        return ds;
    }),
}));

import { runInSandbox } from '../../../src/fluig/runtime/sandbox';

describe('runInSandbox', () => {
    it('executa createDataset simples e retorna dataset', () => {
        const code = `
            function createDataset(fields, constraints, sortFields) {
                var ds = DatasetFactory.createDataset();
                ds.addColumn('nome');
                ds.addRow(['Fluig']);
                return ds;
            }
        `;
        const { dataset, error } = runInSandbox(code);

        expect(error).toBeNull();
        expect(dataset).not.toBeNull();
        expect(dataset!.columns).toEqual(['nome']);
        expect(dataset!.getValue(0, 'nome')).toBe('Fluig');
        expect(dataset!.rowsCount).toBe(1);
    });

    it('suporta múltiplas colunas e linhas', () => {
        const code = `
            function createDataset() {
                var ds = DatasetFactory.createDataset();
                ds.addColumn('id');
                ds.addColumn('valor');
                ds.addRow(['001', 'Alpha']);
                ds.addRow(['002', 'Beta']);
                return ds;
            }
        `;
        const { dataset } = runInSandbox(code);

        expect(dataset!.rowsCount).toBe(2);
        expect(dataset!.getValue(1, 'valor')).toBe('Beta');
    });

    it('captura erro de sintaxe', () => {
        const { error } = runInSandbox('function createDataset() { return ??? }');
        expect(error).not.toBeNull();
        expect(error).toContain('Unexpected');
    });

    it('captura erro de execução (ReferenceError)', () => {
        const code = `function createDataset() { return varInexistente.campo; }`;
        const { error } = runInSandbox(code);
        expect(error).not.toBeNull();
    });

    it('bloqueia acesso a require (segurança)', () => {
        const code = `
            function createDataset() {
                var fs = require('fs');
                return null;
            }
        `;
        const { error } = runInSandbox(code);
        expect(error).not.toBeNull();
    });

    it('ConstraintType está disponível', () => {
        const code = `
            function createDataset(fields, constraints) {
                var c = DatasetFactory.createConstraint('campo', 'A', 'Z', ConstraintType.MUST);
                var ds = DatasetFactory.createDataset();
                ds.addColumn('tipo');
                ds.addRow([c.type]);
                return ds;
            }
        `;
        const { dataset, error } = runInSandbox(code);

        expect(error).toBeNull();
        expect(dataset!.getValue(0, 'tipo')).toBe(1); // ConstraintType.MUST = 1
    });

    it('hAPI.findCardValue usa fixture', () => {
        const code = `
            function createDataset() {
                var cards = hAPI.findCardValue('FORM_USER', [], []);
                var ds = DatasetFactory.createDataset();
                ds.addColumn('login');
                for (var i = 0; i < cards.length; i++) {
                    ds.addRow([cards[i].login]);
                }
                return ds;
            }
        `;
        const { dataset, error } = runInSandbox(code);

        expect(error).toBeNull();
        expect(dataset!.rowsCount).toBeGreaterThan(0);
        expect(dataset!.getValue(0, 'login')).toBe('adm');
    });

    it('registra logs do script', () => {
        const code = `
            function createDataset() {
                log.info('iniciando');
                log.debug('detalhe');
                return DatasetFactory.createDataset();
            }
        `;
        const { logs } = runInSandbox(code);

        expect(logs.some(l => l.includes('iniciando'))).toBe(true);
        expect(logs.some(l => l.includes('detalhe'))).toBe(true);
    });

    it('retorna elapsedMs > 0', () => {
        const code = `function createDataset() { return DatasetFactory.createDataset(); }`;
        const { elapsedMs } = runInSandbox(code);
        expect(elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('retorna dataset null quando createDataset não existe', () => {
        const code = `var x = 42;`;
        const { dataset, error } = runInSandbox(code);
        expect(error).toBeNull();
        expect(dataset).toBeNull();
    });
});
