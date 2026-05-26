/**
 * Transforma o resultado bruto do SOAP em linhas de objeto chave→valor.
 */
export function mapDatasetResult(rawDataset: any): { columns: string[]; values: Record<string, any>[] } {
    const columns: string[] = Array.isArray(rawDataset.columns)
        ? rawDataset.columns
        : [rawDataset.columns];

    const mapRow = (item: any): Record<string, any> => {
        const row: Record<string, any> = {};
        const values = Array.isArray(item.value) ? item.value : [item.value];

        for (let i = 0; i < columns.length; i++) {
            row[columns[i]] = values[i]?.['$value'] ?? null;
        }
        return row;
    };

    const retValues = rawDataset.values;
    let values: Record<string, any>[] = [];

    if (Array.isArray(retValues)) {
        values = retValues.map(mapRow);
    } else if (retValues != null) {
        values.push(mapRow(retValues));
    }

    return { columns, values };
}
