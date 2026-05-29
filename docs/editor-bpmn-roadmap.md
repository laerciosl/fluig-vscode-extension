# Roadmap — Editor de Workflow com bpmn-js (abordagem A2)

Plano incremental para substituir o renderizador SVG feito à mão por um editor
baseado em **bpmn-js**, mantendo o `.process` como fonte da verdade.

## Contexto e decisão

O preview/editor atual (`src/core/views/workflow-preview.webview.ts`) é um
renderizador SVG manual (~800 linhas de JS embutido numa string), sem testes no
front. Avaliamos três caminhos:

- **A1** — bpmn-js só como visualizador (menor esforço).
- **A2** — bpmn-js Modeler como superfície de edição (**escolhido**).
- **B** — diagram-js com importer custom.

### O que o spike provou

Conversor `.process` (XMI Graphiti) → BPMN 2.0:

- ~250 linhas converteram **100% das 83 atividades** do `repair_shop.process`
  (tasks, service-tasks, gateways, link throw/catch, error boundary, subprocess,
  annotations) com **0 warnings** no `bpmn-moddle` (o parser do bpmn-js).
- Dados específicos do Fluig (mecanismo, papel/grupo, SLA, `scriptFileName`)
  vão em `<extensionElements>` e **sobrevivem a um ciclo read→write** do moddle.
- Perdas conhecidas: lanes precisam de `flowNodeRef` por geometria; `end-cancel`
  vira `terminateEvent`; `cardIndex` (formulário) não tem equivalente BPMN.

### A descoberta que define a arquitetura

O `ProcessGraph` (`src/fluig/workflow/process/process.graph.ts`) **já tem a API
completa de edição** — `addNode`, `removeNode`, `moveNode`, `connect`,
`disconnect`, `updateAssignment`, `updateGatewayConditions`, `updateSla`,
`serialize` — e **já faz o round-trip testado de volta pro `.process`**,
preservando as referências EMF posicionais. Logo, **não precisamos de um
serializer reverso BPMN → `.process`**.

## Decisões travadas

1. **Persistência via ponte de eventos → ProcessGraph.** O bpmn-js emite eventos
   de edição; cada um chama a operação equivalente no `ProcessGraph`, que
   serializa pro `.process`. A fonte da verdade continua sendo o `.process`.
2. **Reusar o painel de propriedades atual**, dirigido pela seleção do bpmn-js
   (reaproveita o botão **Carregar** do orgchart, SLA e condições de gateway).
3. **Feature flag** `fluiggers.workflowPreview.engine` (`svg` | `bpmn`,
   default `svg`) para desenvolver o A2 sem quebrar o preview atual até o cutover.

## Arquitetura alvo

```
.process (XMI)
   │  parseProcess + extractEmfDiagram
   ▼
ProcessDefinition + EmfDiagram ──────────────► ProcessGraph (motor de edição)
   │  process-to-bpmn.mapper (forward)              ▲   │ serialize()
   ▼                                                │   ▼
BPMN 2.0 XML ──► [webview] bpmn-js Modeler          │  .process (escrito em disco)
                      │  eventos de edição          │
                      └── postMessage ──► host ─────┘ (traduz evento → op ProcessGraph)
                      ▲  selection.changed
                      └── painel de propriedades (reusado)
```

Mapa de ids: o conversor sanitiza ids para NCName válido. O **host** mantém o mapa
`bpmnId ↔ fluigId` (ele fez a conversão). Nós criados no bpmn-js são reconciliados:
`addNode` retorna o novo `fluigId`, associado ao `bpmnId` recém-criado.

## Infra de build

Sem mexer no entry único do webpack. O bpmn-js tem bundle pré-buildado:

- Gulp copia `node_modules/bpmn-js/dist/bpmn-modeler.production.min.js`,
  o CSS (`dist/assets/bpmn-js.css`, `diagram-js.css`) e a `bpmn-font` para
  `dist/libs/bpmn/` — mesmo padrão de jQuery/Bootstrap.
- O glue do webview vira um arquivo em `resources/` (copiado pelo gulp),
  carregado via `asWebviewUri` — como `ServerView`/`DatasetView` já fazem.

---

## Sprints

Cada sprint deixa a extensão funcionando (atrás do flag até o cutover).

### Sprint 0 — Infra e andaime ✅
- [x] Adicionar dependência `bpmn-js` (18.16.1, devDep); remover devDep `bpmn-moddle` (o bpmn-js já embute o seu).
- [x] Task `buildBpmnJs` no gulp copiando bundles (`bpmn-modeler`/`bpmn-navigated-viewer` production) + CSS (diagram-js + bpmn-js + font embutida) para `dist/libs/bpmn/`.
- [x] Migrar o conversor → `src/fluig/workflow/process/process-to-bpmn.mapper.ts` (`convertProcessToBpmn` devolve `xml` + mapa `idToFluig`/`fluigToId` + `losses`) + 10 testes unitários.
- [x] Criar o setting `fluiggers.workflowPreview.engine` (`svg` | `bpmn`, default `svg`, scope `window`).
- [x] Remover artefatos do spike (`tests/spike/`).
- **Pronto:** build verde (206 unit + 3 integration), flag existe, conversor testado em `src/`.

### Sprint 1 — Renderização (read-only) ✅ (pendente verificação visual)
- [x] Caminho de webview (atrás do flag `bpmn`) que instancia o `BpmnJS` NavigatedViewer, importa o BPMN embutido e dá `fit-viewport`.
- [x] `refresh()` ramifica por engine; quando `bpmn`, converte `.process` → BPMN via `convertProcessToBpmn` e embute o XML no HTML.
- [x] Assets do bpmn-js carregados via `asWebviewUri` (`localResourceRoots` = `dist`), com CSP + nonce; CSS com font base64.
- [x] `initWorkflowPreview(context.extensionUri)` chamado em `registerProcessCommands`.
- **Pronto quando:** abrir `repair_shop.process` com `fluiggers.workflowPreview.engine = bpmn` renderiza no bpmn-js com zoom/pan. *(checagem visual no Extension Host pendente — typecheck/209 testes/webpack OK)*

### Sprint 2 — Seleção + painel de propriedades ✅ (pendente verificação visual)
- [x] Trocado para o `BpmnJS` Modeler (paleta/context-pad escondidos por CSS até o Sprint 5).
- [x] `selection.changed` → mapeia `bpmnId → fluigId` e popula o painel a partir do `RenderNode` embutido.
- [x] Painel compartilhado (`PROPERTY_PANEL_HTML`) + script `BPMN_CLIENT_SCRIPT`; reusa **Carregar** (orgchart), SLA e condições.
- [x] Ações do painel reusam handlers já existentes do host (`patchActivity`/`updateAssignment`/`updateSla`/`updateConditions`/`open*`) — Salvar já persiste.
- **Pronto quando:** clicar num nó mostra o painel atual com os dados Fluig corretos. *(typecheck/212 testes/webpack OK; falta checagem visual)*

> Nota: como o Salvar reusa os handlers do host, o Sprint 3 (editar propriedades) já vem praticamente junto. Falta só o polimento do loop salvar→refresh (preservar viewport/seleção).

### Sprint 3 — Edição de propriedades (sem mudança estrutural) ✅ (pendente verificação visual)
- [x] Salvar no painel → `postMessage` → handlers do host (`patchActivity`/`updateAssignment`/`updateSla`/`updateConditions`) → `serialize` → escreve `.process`. (já veio com o Sprint 2)
- [x] Loop salvar→refresh tratado: o host atualiza o webview vivo via `postMessage updateModel` (não recria o HTML); o webview re-importa preservando viewbox + seleção.
- [x] Guard de reentrância em `importXML` (coalesce para o último update) — um Save pode disparar vários `updateModel`.
- **Pronto quando:** editar nome/mecanismo/grupo/SLA/condições pelo painel persiste no `.process` sem o diagrama "pular". *(typecheck/212 testes/webpack OK; falta checagem visual)*

### Sprint 4 — Mover nós ✅ (pendente verificação visual)
- [x] `commandStack.elements.move.executed`/`shape.move.executed` → `moveNode(fluigId, x, y)` com o novo top-left.
- [x] Guards: ignora conexões (`waypoints`) e shapes que não são atividade (pool/lanes).
- [x] Coordenadas 1:1 confirmadas — `moveNode` patcha x/y do graphicsAlgorithm (top-left Graphiti), igual ao `shape.x/y` do bpmn-js e às DI bounds importadas.
- **Pronto quando:** arrastar um nó persiste a posição no `.process` (e o update incremental mantém o viewport). *(typecheck/212 testes/webpack OK; falta checagem visual)*

> Limitação conhecida (igual ao editor SVG): mover um nó não reroteia as arestas; os bendpoints originais permanecem. Limpeza de roteamento fica para depois.

### Sprint 5 — Criar / conectar / deletar ✅ (pendente verificação visual)
- [x] Paleta + context-pad reativados (removido o CSS que escondia).
- [x] `commandStack.shape.create.executed` → `addNode` (mapeia tipo BPMN → kind Fluig; o re-import troca o id transitório pelo id Fluig — sem reconciliação manual).
- [x] `commandStack.connection.create.executed` → `connectNodes` (nós existentes).
- [x] `commandStack.shape.delete.executed` → `removeNode`; `commandStack.connection.delete.executed` → `disconnectFlow` (via lixeira do context-pad).
- **Pronto quando:** a paleta do bpmn-js cria/conecta/deleta e persiste via ProcessGraph. *(typecheck/212 testes/webpack OK; falta checagem visual)*

> Limitações conhecidas (Sprint 6 / polish):
> - ~~**Append**: a conexão automática não persistia.~~ ✅ Corrigido (ver backlog do Sprint 6).
> - Tipos BPMN sem equivalente Fluig (data object, group, participant) são ignorados e somem no próximo re-import.
> - Sem undo/redo (keyboard não vinculado de propósito — evita dessincronizar do `.process`, já que o re-import zera a pilha do bpmn-js).

### Sprint 6 — Lanes, rendering custom e cutover ⏸️ (pausado — só lanes feitas)
- [x] `flowNodeRef` das lanes por geometria (bounding box) — 83/83 atividades atribuídas no `repair_shop`.
- [x] DI das lanes corrigido para absoluto (coords de lane são relativas ao pool no Graphiti).
- [x] **Badges de validação + tooltips** via API de `overlays` (paridade com o SVG; sem custom renderer). Reaplicados a cada re-import.
- [x] **Tuning leve de labels** — `textRenderer` (Arial; 11px internos, 10px externos) + halo branco via CSS (`paint-order: stroke`) nos `.djs-label`, pra legibilidade sobre as arestas. Sem empacotar.
- [x] **Render custom de FORMAS** — bpmn-js empacotado (segundo entry webpack `web` em `dist/views/bpmn-editor.js`); `BPMN_CLIENT_SCRIPT` inline movido pra `src/core/views/bpmn/webview-entry.ts`; `FluigRenderer` (subclasse de `BaseRenderer`, priority 1500) normaliza tamanhos canônicos (task 100×80, subprocess 110×90, gateway 50×50, eventos 36×36) recentralizando, e delega ao `bpmnRenderer` (mantém ícones de service-task/link/error). Bounds originais do `.process` ficam intactos — só a apresentação é normalizada. Gulp deixou de copiar o UMD `bpmn-modeler.production.min.js`.
- [x] **Append corrigido** — `addNode` envia `tempId`; o host responde `nodeCreated{tempId, fluigId}`; o webview segura a conexão pendente e posta `connectNodes` quando o id Fluig chega (cobre cadeias de append).
- [x] **Debounce de save** — ops de edição aplicam em `currentXml` em memória (síncrono, sem race de re-parse) e um único `commit` (write + refresh) roda após ~120ms de quietude. Beneficia svg e bpmn; o append ficou mais rápido (o `nodeCreated` não espera mais o round-trip do disco). Flush no `dispose` pra não perder edição pendente.
- [ ] **Backlog (decisão do usuário):** tornar `bpmn` o engine padrão e aposentar o SVG — só após aprovação visual.
- **Pronto quando:** paridade funcional com o preview SVG + edição estrutural; flag default `bpmn`.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Loop salvar→refresh recarrega o bpmn-js e perde o viewport | Suprimir o refresh quando a escrita partiu do editor; re-importar preservando zoom/seleção. |
| `flowNodeRef` das lanes (Fluig usa geometria) | Atribuir nós às lanes por bounding box no forward; no save, lanes vêm do ProcessGraph (não do BPMN). |
| Reconciliar ids de nós novos criados no bpmn-js | Host associa o `bpmnId` ao `fluigId` retornado por `addNode`. |
| Conceitos sem equivalente BPMN (cardIndex, end-cancel) | Ficam só no modelo Fluig; o BPMN é superfície de edição, não fonte da verdade. |
| Tamanho do bundle do bpmn-js no webview | Usar o build de produção minificado; carregar só o Modeler. |

## Estado atual

- Spike concluído e validado (conversor forward + round-trip de `extensionElements`).
- **Sprint 0 concluído** — infra do bpmn-js, conversor em `src/` com testes, feature flag, spike removido.
- **Sprint 1 implementado e validado** — render read-only no bpmn-js atrás do flag `bpmn`.
  - Refinamentos: cores semânticas por tipo de nó (DI `color:`/`bioc:`); arestas roteadas pelos bendpoints reais do pictograma (não mais retas centro-a-centro).
- **Sprint 2 implementado** — Modeler + seleção → painel de propriedades reusado; ações reusam os handlers do host (Salvar já persiste).
- **Sprint 3 implementado** — edição de propriedades persiste e o diagrama não "pula" mais ao salvar (update incremental via `postMessage`, viewbox + seleção preservados).
- **Sprint 4 implementado** — arrastar nós persiste a posição via `moveNode`.
- **Sprint 5 implementado** — paleta/context-pad reativados; criar/conectar/deletar persistem via ProcessGraph.
- **Sprint 6** — lanes (flowNodeRefs + DI absoluto), badges de validação/tooltips (overlays), append corrigido, debounce de save e **render custom de formas** (FluigRenderer + bundle webpack `web`) feitos. Só o cutover (engine `bpmn` como default) segue no backlog.
- Estado: engine `bpmn` é funcional atrás do flag (`fluiggers.workflowPreview.engine = bpmn`); default continua `svg`. Falta verificação visual acumulada das sprints.
