import { describe, it, expect } from 'vitest';
import { MockDataset, buildDatasetFactory } from '../../../src/fluig/runtime/mocks/dataset-factory.mock';

describe('MockDataset', () => {
    it('addColumn e rowsCount', () => {
        const ds = new MockDataset();
        expect(ds.rowsCount).toBe(0);
        ds.addColumn('id');
        ds.addColumn('nome');
        expect(ds.columns).toEqual(['id', 'nome']);
    });

    it('addRow e getValue por nome de coluna', () => {
        const ds = new MockDataset();
        ds.addColumn('id');
        ds.addColumn('nome');
        ds.addRow(['001', 'Admin']);
        ds.addRow(['002', 'User']);

        expect(ds.rowsCount).toBe(2);
        expect(ds.getValue(0, 'id')).toBe('001');
        expect(ds.getValue(1, 'nome')).toBe('User');
    });

    it('getValue por índice numérico', () => {
        const ds = new MockDataset();
        ds.addColumn('a');
        ds.addColumn('b');
        ds.addRow([10, 20]);

        expect(ds.getValue(0, 0)).toBe(10);
        expect(ds.getValue(0, 1)).toBe(20);
    });

    it('getValue retorna null para célula inexistente', () => {
        const ds = new MockDataset();
        ds.addColumn('x');
        ds.addRow([1]);

        expect(ds.getValue(99, 'x')).toBeNull();
        expect(ds.getValue(0, 'y')).toBeNull();
    });

    it('getColumnIndex retorna -1 para coluna desconhecida', () => {
        const ds = new MockDataset();
        ds.addColumn('a');
        expect(ds.getColumnIndex('a')).toBe(0);
        expect(ds.getColumnIndex('z')).toBe(-1);
    });

    it('rows() retorna cópia das linhas', () => {
        const ds = new MockDataset();
        ds.addColumn('v');
        ds.addRow([1]);
        ds.addRow([2]);
        expect(ds.rows()).toEqual([[1], [2]]);
    });
});

describe('buildDatasetFactory', () => {
    it('createDataset retorna nova instância a cada chamada', () => {
        const factory = buildDatasetFactory(() => new MockDataset());
        const a = factory.createDataset();
        const b = factory.createDataset();
        a.addColumn('x');
        expect(b.columns).toHaveLength(0);
    });

    it('createConstraint retorna objeto com campos corretos', () => {
        const factory = buildDatasetFactory(() => new MockDataset());
        const c = factory.createConstraint('campo', 'A', 'Z', 1);
        expect(c).toMatchObject({ field: 'campo', initialValue: 'A', finalValue: 'Z', type: 1 });
    });

    it('getDataset delega ao loadFixture', () => {
        const mockDs = new MockDataset();
        mockDs.addColumn('id');
        const factory = buildDatasetFactory(() => mockDs);
        const result = factory.getDataset('dsQualquer', null, null, null);
        expect(result).toBe(mockDs);
    });
});
