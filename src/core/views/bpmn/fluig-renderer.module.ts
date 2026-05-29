/**
 * Módulo didi (DI) que registra o FluigRenderer no container do bpmn-js.
 * Usado via `additionalModules: [fluigRendererModule]` na construção do Modeler.
 */
import FluigRenderer from './fluig-renderer';

export default {
    __init__: ['fluigRenderer'],
    fluigRenderer: ['type', FluigRenderer],
};
