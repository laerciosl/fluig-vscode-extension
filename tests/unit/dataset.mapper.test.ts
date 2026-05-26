import { describe, it, expect } from 'vitest';
import { mapDatasetResult } from '../../src/fluig/datasets/dataset.mapper';
import result from '../fixtures/api/dataset-result.json';

describe('mapDatasetResult', () => {
    it('mapeia múltiplas colunas e múltiplas linhas', () => {
        const { columns, values } = mapDatasetResult(result);

        expect(columns).toEqual(['userId', 'userName', 'userEmail']);
        expect(values).toHaveLength(2);
        expect(values[0]).toEqual({ userId: '001', userName: 'Admin', userEmail: 'admin@co.com' });
        expect(values[1]).toEqual({ userId: '002', userName: 'User',  userEmail: 'user@co.com' });
    });

    it('trata coluna única retornada como string (não array)', () => {
        const raw = {
            columns: 'nome',
            values: [{ value: { $value: 'Teste' } }],
        };
        const { columns, values } = mapDatasetResult(raw);

        expect(columns).toEqual(['nome']);
        expect(values[0]).toEqual({ nome: 'Teste' });
    });

    it('trata linha única retornada como objeto (não array)', () => {
        const raw = {
            columns: ['id', 'nome'],
            values: { value: [{ $value: '1' }, { $value: 'Único' }] },
        };
        const { columns, values } = mapDatasetResult(raw);

        expect(values).toHaveLength(1);
        expect(values[0]).toEqual({ id: '1', nome: 'Único' });
    });

    it('retorna null para valores ausentes', () => {
        const raw = {
            columns: ['a', 'b', 'c'],
            values: [{ value: [{ $value: 'x' }] }],
        };
        const { values } = mapDatasetResult(raw);

        expect(values[0].a).toBe('x');
        expect(values[0].b).toBeNull();
        expect(values[0].c).toBeNull();
    });

    it('retorna arrays vazios quando values é null', () => {
        const raw = { columns: ['id'], values: null };
        const { columns, values } = mapDatasetResult(raw);

        expect(columns).toEqual(['id']);
        expect(values).toHaveLength(0);
    });
});
