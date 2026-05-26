import { describe, it, expect } from 'vitest';
import { resolveImportUri } from '../../src/fluig/widgets/widget.service';

const base = { path: '/ws/wcm/widget/myWidget', fsPath: '/ws/wcm/widget/myWidget' };

describe('resolveImportUri', () => {
    it('resources/ → src/main/webapp/resources/', () => {
        const uri = resolveImportUri(base as any, 'resources/js/app.js');
        expect(uri?.path).toContain('src/main/webapp/resources/js/app.js');
    });

    it('WEB-INF/classes/arquivo.properties → src/main/resources/', () => {
        const uri = resolveImportUri(base as any, 'WEB-INF/classes/messages.properties');
        expect(uri?.path).toContain('src/main/resources/messages.properties');
    });

    it('WEB-INF/arquivo.xml → src/main/webapp/WEB-INF/', () => {
        const uri = resolveImportUri(base as any, 'WEB-INF/widget.xml');
        expect(uri?.path).toContain('src/main/webapp/WEB-INF/widget.xml');
    });

    it('WEB-INF/classes/pacote/Classe.class → src/main/java/', () => {
        const uri = resolveImportUri(base as any, 'WEB-INF/classes/com/example/Widget.class');
        expect(uri?.path).toContain('src/main/java/com/example/Widget.class');
    });

    it('pom.xml → raiz do widget', () => {
        const uri = resolveImportUri(base as any, 'pom.xml');
        expect(uri?.path).toBe('/ws/wcm/widget/myWidget/pom.xml');
    });

    it('caminho desconhecido → null', () => {
        expect(resolveImportUri(base as any, 'META-INF/MANIFEST.MF')).toBeNull();
        expect(resolveImportUri(base as any, '')).toBeNull();
    });
});
