/**
 * Modelo EMF (Eclipse Modeling Framework) da camada pictograma do .process.
 *
 * O arquivo .process tem duas camadas:
 *   - Business layer (bpmn2:*): modelada em ProcessDefinition
 *   - Pictogram layer (pi:Diagram): modelada aqui
 *
 * A estrutura do pi:Diagram descoberta por engenharia reversa:
 *
 *   pi:Diagram (/0/)
 *   ├─ graphicsAlgorithm  ← canvas 1000×1000
 *   ├─ styles × N         ← estilos visuais
 *   ├─ colors × N         ← paleta de cores
 *   ├─ fonts × N          ← fontes
 *   ├─ @children.0        ← Pool (ContainerShape)
 *   │   └─ @children.0..M ← Swimlanes (aninhados no pool)
 *   ├─ @children.1..N     ← Activity shapes (diretos no Diagram)
 *   └─ @connections.0..K  ← FreeFormConnection shapes
 *
 * pictogramLinks = lista espaço-separada de todos os /@link em ordem de inserção.
 * Connections usam refs posicionais: start="/0/@children.N/@anchors.0"
 */

export interface EmfDiagram {
    /** Atributo `name` do pi:Diagram (igual ao id do processo). */
    name: string;
    /** Atributo `gridUnit`. */
    gridUnit: string;
    /** Atributo `version`. */
    version: string;
    /**
     * Tudo dentro do pi:Diagram antes do primeiro `<children` — inclui
     * graphicsAlgorithm do canvas, todas as styles, colors e fonts.
     * Nunca recalculado; preservado integralmente no round-trip.
     */
    rawPreamble: string;
    /** Pool shape (sempre @children.0), preservado como raw XML. */
    pool: EmfPool;
    /**
     * Activity shapes (@children.1..N), na ordem em que aparecem no XML.
     * Cada shape corresponde a um activity ou annotation do ProcessDefinition.
     */
    shapes: EmfShape[];
    /**
     * Connection shapes (@connections.0..M), na ordem em que aparecem no XML.
     * Cada connection corresponde a um ProcessTransition.
     */
    connections: EmfConnection[];
}

export interface EmfPool {
    /** businessId do pool (ex: "pool1"). */
    businessId: string;
    /**
     * XML raw completo do pool, incluindo swimlanes aninhadas.
     * Preservado integralmente — as refs internas de swimlane não mudam ao editar atividades.
     */
    rawXml: string;
    /**
     * Número de `<children>` diretos do pool (swimlanes + text label).
     * Usado para gerar refs `/0/@children.0/@children.N`.
     */
    swimlaneCount: number;
}

export interface EmfShape {
    /** businessId da atividade/annotation correspondente (ex: "task9"). */
    businessId: string;
    /**
     * Índice em @children do pi:Diagram.
     * Pool = 0; atividades começam em 1 e são numeradas sequencialmente.
     */
    childIndex: number;
    /**
     * XML raw do shape. Os atributos `outgoingConnections` e `incomingConnections`
     * nos `<anchors xsi:type="pi:ChopboxAnchor">` são remendados pelo serializer
     * quando a topologia da transitions muda.
     */
    rawXml: string;
    /** businessIds dos SequenceFlows que partem desta atividade. */
    outgoingFlowIds: string[];
    /** businessIds dos SequenceFlows que chegam nesta atividade. */
    incomingFlowIds: string[];
}

export interface EmfConnection {
    /** businessId do SequenceFlow correspondente (ex: "flow12"). */
    businessId: string;
    /** Índice em @connections do pi:Diagram (0-based). */
    connectionIndex: number;
    /**
     * XML raw da connection. Os atributos `start` e `end` são remendados pelo
     * serializer com base nos childIndexes atuais de source e target.
     */
    rawXml: string;
    /** businessId da atividade de origem. */
    sourceBusinessId: string;
    /** businessId da atividade de destino. */
    targetBusinessId: string;
}
