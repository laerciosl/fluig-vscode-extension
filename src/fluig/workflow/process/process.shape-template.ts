import type { ActivityKind } from './process.types';
import type { EmfShape } from './process.emf-model';
import { escapeXmlAttr } from './process.serializer';

/**
 * Dimensões padrão por kind, em pixels (coordenadas do Fluig/Graphiti).
 */
export const DEFAULT_NODE_SIZE: Record<ActivityKind, { w: number; h: number }> = {
    'start':                   { w: 35, h: 35 },
    'end':                     { w: 35, h: 35 },
    'end-cancel':              { w: 35, h: 35 },
    'task':                    { w: 106, h: 82 },
    'service-task':            { w: 106, h: 82 },
    'subprocess':              { w: 105, h: 82 },
    'gateway-exclusive':       { w: 60, h: 132 },
    'intermediate-link-throw': { w: 35, h: 35 },
    'intermediate-link-receive':{ w: 35, h: 35 },
    'intermediate-error':      { w: 30, h: 30 },
};

/**
 * Referências a estilos visuais do pi:Diagram (existentes no rawPreamble do arquivo).
 * Usadas para manter a aparência consistente com o restante do processo.
 */
export interface StyleRefs {
    /** Estilo da forma principal (RoundedRectangle, Polygon, etc.) */
    mainStyle?: string;
    /** Estilo do texto (MultiText). */
    textStyle?: string;
    /** Estilo do polígono interno (gateway/intermediate). */
    polygonStyle?: string;
}

/**
 * Opções para geração de XML de uma nova shape.
 */
export interface ShapeTemplateOptions {
    businessId: string;
    kind: ActivityKind;
    label: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    /** Índice em @children do pi:Diagram — necessário para refs de BoxRelativeAnchor. */
    childIndex: number;
    /** Refs de estilo extraídas do processo existente (opcional). */
    styleRefs?: StyleRefs;
}

/**
 * Gera o rawXml de uma nova shape para o pi:Diagram.
 *
 * Os atributos outgoingConnections/incomingConnections nos anchors ficam vazios;
 * serializeProcess() os preencherá automaticamente ao serializar.
 */
export function buildShapeXml(opts: ShapeTemplateOptions): string {
    const size = DEFAULT_NODE_SIZE[opts.kind];
    const w = opts.width ?? size.w;
    const h = opts.height ?? size.h;

    switch (opts.kind) {
        case 'start':             return buildEventXml(opts, w, h, 'start', opts.styleRefs?.mainStyle);
        case 'end':               return buildEventXml(opts, w, h, 'end', opts.styleRefs?.mainStyle);
        case 'end-cancel':        return buildEventXml(opts, w, h, 'end-cancel', opts.styleRefs?.mainStyle);
        case 'task':              return buildTaskXml(opts, w, h, false);
        case 'service-task':      return buildTaskXml(opts, w, h, true);
        case 'subprocess':        return buildSubprocessXml(opts, w, h);
        case 'gateway-exclusive': return buildGatewayXml(opts, w, h);
        case 'intermediate-link-throw':   return buildIntermediateXml(opts, w, h, 'throw');
        case 'intermediate-link-receive': return buildIntermediateXml(opts, w, h, 'receive');
        case 'intermediate-error':        return buildIntermediateXml(opts, w, h, 'error');
    }
}

/**
 * Gera o rawXml de uma nova FreeFormConnection.
 * Os atributos start= e end= ficam provisórios; serializeProcess() os corrige.
 */
export function buildConnectionXml(businessId: string, label: string): string {
    const labelEsc = escapeXmlAttr(label);
    return [
        `    <connections xsi:type="pi:FreeFormConnection" visible="true" active="true" start="" end="">`,
        `      <graphicsAlgorithm xsi:type="al:Polyline" lineWidth="1" filled="false" transparency="0.0"/>`,
        `      <link businessObjects="${businessId}"/>`,
        `      <connectionDecorators visible="true" active="true" locationRelative="true" location="0.5">`,
        `        <graphicsAlgorithm xsi:type="al:Text" lineWidth="1" filled="false" transparency="0.0" x="10" value="${labelEsc}"/>`,
        `      </connectionDecorators>`,
        `      <connectionDecorators visible="true" locationRelative="true" location="1.0">`,
        `        <graphicsAlgorithm xsi:type="al:Polygon" lineWidth="1" filled="true" transparency="0.0">`,
        `          <points x="-10" y="-5" before="3" after="3"/>`,
        `          <points/>`,
        `          <points x="-10" y="5" before="3" after="3"/>`,
        `          <points x="-8" before="3" after="3"/>`,
        `        </graphicsAlgorithm>`,
        `      </connectionDecorators>`,
        `    </connections>`,
    ].join('\n');
}

/**
 * Extrai StyleRefs do primeiro shape existente do mesmo kind no processo.
 * Retorna undefined se não encontrar shape do kind ou se o rawXml não contiver refs.
 */
export function extractStyleRefs(
    shapes: EmfShape[],
    kindOfShape: (shape: EmfShape) => boolean
): StyleRefs | undefined {
    const match = shapes.find(kindOfShape);
    if (!match) { return undefined; }
    return extractStyleRefsFromXml(match.rawXml);
}

function extractStyleRefsFromXml(rawXml: string): StyleRefs {
    const refs: StyleRefs = {};
    // Extrai o primeiro style="/0/@styles.N" de cada elemento relevante
    const mainMatch = /xsi:type="al:(?:RoundedRectangle|Polygon|Ellipse)"[^>]*style="([^"]+)"/.exec(rawXml);
    if (mainMatch) { refs.mainStyle = mainMatch[1]; }

    const textMatch = /xsi:type="al:MultiText"[^>]*style="([^"]+)"/.exec(rawXml);
    if (textMatch) { refs.textStyle = textMatch[1]; }

    const polyMatch = /graphicsAlgorithmChildren[^>]*xsi:type="al:(?:Polygon|Ellipse)"[^>]*style="([^"]+)"/.exec(rawXml);
    if (polyMatch) { refs.polygonStyle = polyMatch[1]; }

    return refs;
}

// ── Builders por tipo ─────────────────────────────────────────────────────

function anchor(childIndex: number, useChildren = false): string {
    const base = `/0/@children.${childIndex}/@graphicsAlgorithm`;
    const ref = useChildren ? `${base}/@graphicsAlgorithmChildren.0` : base;
    return [
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <anchors xsi:type="pi:BoxRelativeAnchor" visible="true" active="true"`,
        `        referencedGraphicsAlgorithm="${ref}" relativeWidth="1.0" relativeHeight="0.51">`,
        `        <graphicsAlgorithm xsi:type="al:Ellipse" filled="false" lineVisible="false"/>`,
        `      </anchors>`,
    ].join('\n');
}

function buildEventXml(
    opts: ShapeTemplateOptions,
    w: number,
    h: number,
    variant: 'start' | 'end' | 'end-cancel',
    mainStyle?: string
): string {
    const labelEsc = escapeXmlAttr(opts.label);
    const styleAttr = mainStyle ? ` style="${mainStyle}"` : '';
    const borderWidth = variant === 'start' ? '1' : '3';

    return [
        `    <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `      <graphicsAlgorithm xsi:type="al:Ellipse" lineWidth="1" filled="false" lineVisible="false"`,
        `        transparency="0.0" width="${w}" height="${h}" x="${opts.x}" y="${opts.y}">`,
        `        <graphicsAlgorithmChildren xsi:type="al:Ellipse" lineWidth="${borderWidth}"`,
        `          transparency="0.0" width="${w}" height="${h}"${styleAttr}/>`,
        `      </graphicsAlgorithm>`,
        `      <link businessObjects="${opts.businessId}"/>`,
        anchor(opts.childIndex, true),
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:Text" lineWidth="1" filled="false" transparency="0.0"`,
        `          width="${w}" x="0" y="${h + 4}" horizontalAlignment="ALIGNMENT_CENTER" value="${labelEsc}"/>`,
        `      </children>`,
        `    </children>`,
    ].join('\n');
}

function buildTaskXml(
    opts: ShapeTemplateOptions,
    w: number,
    h: number,
    isService: boolean
): string {
    const labelEsc = escapeXmlAttr(opts.label);
    const mainStyle = opts.styleRefs?.mainStyle ?? '';
    const textStyle = opts.styleRefs?.textStyle ?? '';
    const mainStyleAttr = mainStyle ? ` style="${mainStyle}"` : '';
    const textStyleAttr = textStyle ? ` style="${textStyle}"` : '';

    const iconLine = isService ? [
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:Image" lineWidth="1" transparency="0.0"`,
        `          width="16" height="16" x="5" y="5"`,
        `          id="com.totvs.tds.ecm.designer.task.service"`,
        `          stretchH="false" stretchV="false" proportional="false"/>`,
        `      </children>`,
    ].join('\n') : '';

    return [
        `    <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `      <graphicsAlgorithm xsi:type="al:Rectangle" lineWidth="1" filled="false" lineVisible="false"`,
        `        transparency="0.0" width="${w}" height="${h}" x="${opts.x}" y="${opts.y}"/>`,
        `      <link businessObjects="${opts.businessId}"/>`,
        anchor(opts.childIndex, false),
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:RoundedRectangle" lineWidth="1" transparency="0.0"`,
        `          width="${w}" height="${h}"${mainStyleAttr} cornerHeight="5" cornerWidth="5"/>`,
        `      </children>`,
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:MultiText" lineWidth="1" filled="false" lineVisible="true"`,
        `          transparency="0.0" width="${w - 10}" height="${h - 10}" x="5" y="5"`,
        `          ${textStyleAttr} font="/0/@fonts.2" horizontalAlignment="ALIGNMENT_CENTER"`,
        `          value="${labelEsc}"/>`,
        `      </children>`,
        ...(iconLine ? [iconLine] : []),
        `    </children>`,
    ].join('\n');
}

function buildSubprocessXml(
    opts: ShapeTemplateOptions,
    w: number,
    h: number
): string {
    const labelEsc = escapeXmlAttr(opts.label);
    const mainStyle = opts.styleRefs?.mainStyle ?? '';
    const textStyle = opts.styleRefs?.textStyle ?? '';
    const mainStyleAttr = mainStyle ? ` style="${mainStyle}"` : '';
    const textStyleAttr = textStyle ? ` style="${textStyle}"` : '';

    return [
        `    <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `      <graphicsAlgorithm xsi:type="al:RoundedRectangle" lineWidth="3" transparency="0.0"`,
        `        width="${w}" height="${h}" x="${opts.x}" y="${opts.y}"${mainStyleAttr}`,
        `        cornerHeight="5" cornerWidth="5"/>`,
        `      <link businessObjects="${opts.businessId}"/>`,
        `      <anchors xsi:type="pi:BoxRelativeAnchor" visible="true" active="true"`,
        `        referencedGraphicsAlgorithm="/0/@children.${opts.childIndex}/@graphicsAlgorithm"`,
        `        relativeWidth="1.0" relativeHeight="0.51">`,
        `        <graphicsAlgorithm xsi:type="al:Ellipse" filled="false" lineVisible="false"/>`,
        `      </anchors>`,
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:MultiText" lineWidth="1" filled="false" lineVisible="true"`,
        `          transparency="0.0" width="${w - 10}" height="${h - 10}" x="5" y="5"`,
        `          ${textStyleAttr} font="/0/@fonts.2" horizontalAlignment="ALIGNMENT_CENTER"`,
        `          value="${labelEsc}"/>`,
        `      </children>`,
        `    </children>`,
    ].join('\n');
}

function buildGatewayXml(
    opts: ShapeTemplateOptions,
    w: number,
    h: number
): string {
    const labelEsc = escapeXmlAttr(opts.label);
    const polyStyle = opts.styleRefs?.polygonStyle ?? '';
    const textStyle = opts.styleRefs?.textStyle ?? '';
    const polyStyleAttr = polyStyle ? ` style="${polyStyle}"` : '';
    const textStyleAttr = textStyle ? ` style="${textStyle}"` : '';
    // Diamond occupies top 'w' pixels; text label below
    const diamondH = w;
    const textY = diamondH;

    return [
        `    <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `      <graphicsAlgorithm xsi:type="al:Rectangle" lineWidth="1" filled="false" lineVisible="false"`,
        `        transparency="0.0" width="${w}" height="${h}" x="${opts.x}" y="${opts.y}">`,
        `        <graphicsAlgorithmChildren xsi:type="al:Polygon" lineWidth="1" filled="true"`,
        `          transparency="0.0" width="${w}" height="${diamondH}"${polyStyleAttr}>`,
        `          <points y="${diamondH / 2}"/>`,
        `          <points x="${w / 2}"/>`,
        `          <points x="${w}" y="${diamondH / 2}"/>`,
        `          <points x="${w / 2}" y="${diamondH}"/>`,
        `          <points y="${diamondH / 2}"/>`,
        `        </graphicsAlgorithmChildren>`,
        `      </graphicsAlgorithm>`,
        `      <link businessObjects="${opts.businessId}"/>`,
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <anchors xsi:type="pi:BoxRelativeAnchor" visible="true" active="true"`,
        `        referencedGraphicsAlgorithm="/0/@children.${opts.childIndex}/@graphicsAlgorithm/@graphicsAlgorithmChildren.0"`,
        `        relativeWidth="0.51" relativeHeight="0.1">`,
        `        <graphicsAlgorithm xsi:type="al:Ellipse" filled="false" lineVisible="false"/>`,
        `      </anchors>`,
        `      <anchors xsi:type="pi:ChopboxAnchor"/>`,
        `      <anchors xsi:type="pi:BoxRelativeAnchor" visible="true" active="true"`,
        `        referencedGraphicsAlgorithm="/0/@children.${opts.childIndex}/@graphicsAlgorithm/@graphicsAlgorithmChildren.0"`,
        `        relativeWidth="0.51" relativeHeight="0.93">`,
        `        <graphicsAlgorithm xsi:type="al:Ellipse" filled="false" lineVisible="false"/>`,
        `      </anchors>`,
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:MultiText" lineWidth="1" filled="false" lineVisible="true"`,
        `          transparency="0.0" width="${w}" height="${h - textY}" y="${textY}"`,
        `          ${textStyleAttr} font="/0/@fonts.2" horizontalAlignment="ALIGNMENT_CENTER"`,
        `          value="${labelEsc}"/>`,
        `      </children>`,
        `    </children>`,
    ].join('\n');
}

function buildIntermediateXml(
    opts: ShapeTemplateOptions,
    w: number,
    h: number,
    variant: 'throw' | 'receive' | 'error'
): string {
    const labelEsc = escapeXmlAttr(opts.label);
    const mainStyle = opts.styleRefs?.mainStyle ?? '';
    const mainStyleAttr = mainStyle ? ` style="${mainStyle}"` : '';

    let innerXml = '';
    if (variant === 'throw') {
        // Seta preenchida (link throw)
        innerXml = [
            `      <children visible="true">`,
            `        <graphicsAlgorithm xsi:type="al:Polygon" lineWidth="1" filled="true"`,
            `          transparency="0.0" width="${w - 5}" height="${h - 5}">`,
            `          <points y="7"/>`,
            `          <points x="${Math.round(w / 2)}" y="7"/>`,
            `          <points x="${Math.round(w / 2)}"/>`,
            `          <points x="${w - 5}" y="${Math.round(h / 2)}"/>`,
            `          <points x="${Math.round(w / 2)}" y="${h - 5}"/>`,
            `          <points x="${Math.round(w / 2)}" y="${Math.round(h * 0.65)}"/>`,
            `          <points y="${Math.round(h * 0.65)}"/>`,
            `        </graphicsAlgorithm>`,
            `      </children>`,
        ].join('\n');
    } else if (variant === 'receive') {
        // Seta vazia (link receive)
        innerXml = [
            `      <children visible="true">`,
            `        <graphicsAlgorithm xsi:type="al:Polygon" lineWidth="2" filled="false"`,
            `          lineVisible="true" transparency="0.0" width="${w - 5}" height="${h - 5}">`,
            `          <points y="7"/>`,
            `          <points x="${Math.round(w / 2)}" y="7"/>`,
            `          <points x="${Math.round(w / 2)}"/>`,
            `          <points x="${w - 5}" y="${Math.round(h / 2)}"/>`,
            `          <points x="${Math.round(w / 2)}" y="${h - 5}"/>`,
            `          <points x="${Math.round(w / 2)}" y="${Math.round(h * 0.65)}"/>`,
            `          <points y="${Math.round(h * 0.65)}"/>`,
            `        </graphicsAlgorithm>`,
            `      </children>`,
        ].join('\n');
    } else {
        // Raio (error)
        innerXml = [
            `      <children visible="true">`,
            `        <graphicsAlgorithm xsi:type="al:Polygon" lineWidth="2" filled="false"`,
            `          lineVisible="true" transparency="0.0" width="20" height="20">`,
            `          <points x="6" y="25"/>`,
            `          <points x="12" y="5"/>`,
            `          <points x="18" y="15"/>`,
            `          <points x="26" y="5"/>`,
            `          <points x="18" y="25"/>`,
            `          <points x="12" y="15"/>`,
            `        </graphicsAlgorithm>`,
            `      </children>`,
        ].join('\n');
    }

    return [
        `    <children xsi:type="pi:ContainerShape" visible="true" active="true">`,
        `      <graphicsAlgorithm xsi:type="al:Ellipse" lineWidth="1" filled="false" lineVisible="false"`,
        `        transparency="0.0" width="${w}" height="${h}" x="${opts.x}" y="${opts.y}">`,
        `        <graphicsAlgorithmChildren xsi:type="al:Ellipse" lineWidth="1"`,
        `          transparency="0.0" width="${w}" height="${h}"${mainStyleAttr}/>`,
        `      </graphicsAlgorithm>`,
        `      <link businessObjects="${opts.businessId}"/>`,
        anchor(opts.childIndex, true),
        `      <children visible="true">`,
        `        <graphicsAlgorithm xsi:type="al:Text" lineWidth="1" filled="false" transparency="0.0"`,
        `          width="${w}" x="0" y="${h + 4}" horizontalAlignment="ALIGNMENT_CENTER" value="${labelEsc}"/>`,
        `      </children>`,
        innerXml,
        `    </children>`,
    ].join('\n');
}
