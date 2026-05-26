import { describe, it, expect } from 'vitest';
import { resolveExportType } from '../../src/core/watch';

describe('resolveExportType', () => {
    it.each([
        ['/ws/datasets/dsUser.js',                  'dataset'],
        ['/ws/datasets/sub/dsUser.js',               'dataset'],
        ['/ws/events/onMessage.js',                  'globalEvent'],
        ['/ws/workflow/scripts/PRC001.afterTask.js', 'workflow'],
        ['/ws/mechanisms/mec_custom.js',             'mechanism'],
        ['/ws/forms/FormUser/form.html',             'form'],
        ['/ws/forms/FormUser/events/validate.js',    'form'],
        ['/ws/widget/myWidget/src/main/webapp/app.js', 'widget'],
    ])('"%s" → %s', (path, expected) => {
        expect(resolveExportType(path)).toBe(expected);
    });

    it('retorna null para caminhos não reconhecidos', () => {
        expect(resolveExportType('/ws/readme.md')).toBeNull();
        expect(resolveExportType('/ws/mock/cards/FORM.json')).toBeNull();
        expect(resolveExportType('')).toBeNull();
    });

    it('funciona com separadores Windows (\\)', () => {
        expect(resolveExportType('C:\\ws\\datasets\\dsUser.js')).toBe('dataset');
        expect(resolveExportType('C:\\ws\\events\\onMsg.js')).toBe('globalEvent');
    });
});
