/**
 * Dimensões canônicas (BPMN spec / bpmn.io) usadas pelo engine `bpmn` do preview.
 *
 * Por que existem: o `.process` (Graphiti) costuma armazenar bounds não-uniformes
 * (uma task com 142×60, outra com 100×80, anotações 200×150…). Pra um editor
 * BPMN consistente, normalizamos os bounds *na hora de emitir o XML BPMN* —
 * centrando no mesmo centro original. Assim:
 *   - bpmn-js renderiza no tamanho certo (sem precisar de custom renderer)
 *   - conexões projetam corretamente na borda do nó (mapper usa o mesmo bound)
 *   - o `.process` continua com bounds originais (não destruímos dado nenhum)
 *
 * O `moveNode` faz a operação inversa: converte o top-left canônico recebido do
 * bpmn-js de volta pro top-left original (preservando o centro), pra escrever
 * em `activity.coords` sem mexer em width/height.
 */
import type { ActivityKind } from './process.types';

export interface CanonicalBounds { width: number; height: number; }

export const CANONICAL_ACTIVITY_BOUNDS: Record<ActivityKind, CanonicalBounds> = {
    'start':                     { width: 36, height: 36 },
    'end':                       { width: 36, height: 36 },
    'end-cancel':                { width: 36, height: 36 },
    'task':                      { width: 100, height: 80 },
    'service-task':              { width: 100, height: 80 },
    'subprocess':                { width: 110, height: 90 },
    'gateway-exclusive':         { width: 50, height: 50 },
    'intermediate-link-throw':   { width: 36, height: 36 },
    'intermediate-link-receive': { width: 36, height: 36 },
    'intermediate-error':        { width: 36, height: 36 },
};

export const CANONICAL_ANNOTATION_BOUNDS: CanonicalBounds = { width: 100, height: 30 };
