export class MockDataset {
    readonly columns: string[] = [];
    private readonly _rows: any[][] = [];

    addColumn(fieldName: string): void {
        this.columns.push(String(fieldName));
    }

    addRow(values: any[]): void {
        this._rows.push(Array.isArray(values) ? values : [values]);
    }

    getValue(rowIndex: number, field: string | number): any {
        const colIdx = typeof field === 'string' ? this.columns.indexOf(field) : field;
        return this._rows[rowIndex]?.[colIdx] ?? null;
    }

    getColumnIndex(fieldName: string): number {
        return this.columns.indexOf(fieldName);
    }

    get rowsCount(): number {
        return this._rows.length;
    }

    rows(): any[][] {
        return this._rows;
    }
}

export interface DatasetFactoryMock {
    createDataset(): MockDataset;
    createConstraint(field: string, initialValue: any, finalValue: any, type: any): object;
    getDataset(id: string, fields: string[] | null, constraints: any[] | null, sortFields: string[] | null): MockDataset;
}

export function buildDatasetFactory(
    loadFixture: (datasetId: string) => MockDataset
): DatasetFactoryMock {
    return {
        createDataset: () => new MockDataset(),
        createConstraint: (field, initialValue, finalValue, type) => ({ field, initialValue, finalValue, type }),
        getDataset: (id) => loadFixture(id),
    };
}
