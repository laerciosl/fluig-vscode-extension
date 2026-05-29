/**
 * Renderer customizado para o preview/editor Fluig.
 *
 * Hoje é só um esqueleto: a normalização de tamanho das formas é feita no MAPPER
 * (`process-to-bpmn.mapper.ts`), que emite bounds canônicos centrados no centro
 * original. Isso mantém o `bpmn-js` renderizando "do jeito que ele quer", com
 * conexões projetando na borda do nó canônico, sem precisar mutar elementos em
 * runtime — o que evita o problema "arrasta e volta" causado por math
 * inconsistente entre renderer e moveNode.
 *
 * Por que mantemos o renderer: serve de gancho pra decorações Fluig específicas
 * no futuro (ex.: ícone do mecanismo de atribuição no canto da task, badges de
 * SLA). Por enquanto delega 100% ao bpmnRenderer nativo.
 */
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type BpmnRenderer from 'bpmn-js/lib/draw/BpmnRenderer';
import type { ShapeLike, ElementLike } from 'diagram-js/lib/model/Types';

const RENDER_PRIORITY = 1500;

export default class FluigRenderer extends BaseRenderer {
    static $inject = ['eventBus', 'bpmnRenderer'];

    private readonly bpmnRenderer: BpmnRenderer;

    constructor(eventBus: EventBus, bpmnRenderer: BpmnRenderer) {
        super(eventBus, RENDER_PRIORITY);
        this.bpmnRenderer = bpmnRenderer;
    }

    canRender(_element: ElementLike): boolean {
        // Sem decorações custom hoje: deixa o bpmnRenderer nativo cuidar de tudo.
        return false;
    }

    drawShape(parentGfx: SVGElement, shape: ShapeLike): SVGElement {
        return this.bpmnRenderer.drawShape(parentGfx, shape as Parameters<BpmnRenderer['drawShape']>[1]);
    }

    getShapePath(shape: ShapeLike): string {
        return this.bpmnRenderer.getShapePath(shape as Parameters<BpmnRenderer['getShapePath']>[0]);
    }
}
