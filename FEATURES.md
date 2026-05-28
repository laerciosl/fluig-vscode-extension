# Funcionalidades — Fluig Extensão para VS Code

> Versão atual: **2.11.0** — Extensão para agilizar o desenvolvimento para o TOTVS Fluig no VS Code.

---

## Sumário

1. [Gerenciamento de Servidores](#1-gerenciamento-de-servidores)
2. [Datasets](#2-datasets)
3. [Formulários](#3-formulários)
4. [Eventos Globais](#4-eventos-globais)
5. [Workflow — Processos e Mecanismos](#5-workflow--processos-e-mecanismos)
6. [Widgets](#6-widgets)
7. [Status Bar](#7-status-bar)
8. [Auto Export ao Salvar](#8-auto-export-ao-salvar)
9. [Explorer Inteligente — Status e Diff](#9-explorer-inteligente--status-e-diff)
10. [Runtime Local de Dataset](#10-runtime-local-de-dataset)
11. [Snippets](#11-snippets)
12. [Biblioteca de Tipos](#12-biblioteca-de-tipos)
13. [Configurações](#13-configurações)

---

## 1. Gerenciamento de Servidores

Painel lateral dedicado (aba **Servidores**) para cadastrar e gerenciar conexões com servidores Fluig.

| Ação | Como acionar |
|---|---|
| Adicionar servidor | Botão `+` no painel lateral |
| Editar servidor | Botão de lápis no item do servidor |
| Excluir servidor | Botão de lixeira no item do servidor |
| Conectar ao servidor | Botão de plug no item / menu de contexto |
| Desconectar do servidor | Botão de plug no item conectado |
| Testar conexão | Menu de contexto → **Fluig: Testar Conexão** |
| Atualizar lista | Botão de refresh no painel |

**Teste de conexão** (`Fluig: Testar Conexão`) verifica 5 pontos de forma sequencial e exibe o resultado no Output Channel `Fluig`:
1. Login (form ou browser/MFA)
2. Tenant / Usuário
3. Dataset API (SOAP)
4. Workflow API (REST)
5. FluiggersWidget instalado

**Armazenamento de credenciais:** senhas salvas com criptografia AES-256-CBC vinculada ao `machineId` do VS Code. O arquivo de configuração (`.vscode/fluig-servers.json`) é recarregado automaticamente quando alterado externamente.

**Autenticação com MFA:** suporte a login via browser (Chromium/Firefox) usando Puppeteer-Core. Configurar o caminho do executável em `fluiggers.browserPath`.

---

## 2. Datasets

Painel lateral dedicado (aba **Datasets**) lista todos os datasets customizados do servidor conectado.

### Importar

| Ação | Como acionar |
|---|---|
| Importar um dataset | Menu de contexto do Explorer → **Importar Dataset** |
| Importar vários datasets | Menu de contexto do Explorer → **Importar Vários Datasets** |
| Importar pelo painel lateral | Clique direito no item do dataset → **Importar Dataset** |

Ao importar, o arquivo é salvo em `datasets/{datasetId}.js`. Se o arquivo já existir localmente, é sobrescrito no caminho atual.

### Exportar

| Ação | Como acionar |
|---|---|
| Exportar um arquivo de dataset | Clique direito no arquivo `.js` → **Exportar Dataset** |
| Exportar pasta inteira | Clique direito na pasta `datasets/` → **Exportar Datasets da Pasta** |

Ao exportar, o QuickPick apresenta os datasets existentes no servidor para mapear ao arquivo local ou criar um novo.

### Consultar

| Ação | Como acionar |
|---|---|
| Abrir visualizador de dataset | Menu de contexto → **Consultar Dataset** |
| Consultar pelo painel lateral | Clique direito no item → **Consultar Dataset** |

### Criar

| Ação | Como acionar |
|---|---|
| Novo dataset (scaffold) | Menu de contexto do Explorer → **Novo Dataset** |

Cria o arquivo `.js` com estrutura mínima a partir de template.

---

## 3. Formulários

Painel lateral dedicado (aba **Formulários**) lista os formulários do servidor conectado.

### Importar

| Ação | Como acionar |
|---|---|
| Importar um formulário | Menu de contexto do Explorer → **Importar Formulário** |
| Importar vários formulários | Menu de contexto do Explorer → **Importar Vários Formulários** |
| Importar pelo painel lateral | Clique direito no item → **Importar Formulário** |

O formulário é salvo em `forms/{nome}/` com seus arquivos HTML e eventos JavaScript.

### Exportar

| Ação | Como acionar |
|---|---|
| Exportar formulário | Clique direito em qualquer arquivo dentro de `forms/` → **Exportar Formulário** |

### Criar

| Ação | Como acionar |
|---|---|
| Novo formulário (scaffold) | Menu de contexto → **Novo Formulário** |
| Novo evento de formulário | Clique direito dentro de `forms/` → **Novo Evento de Formulário** |

---

## 4. Eventos Globais

### Importar

| Ação | Como acionar |
|---|---|
| Importar um evento global | Menu de contexto do Explorer → **Importar Evento Global** |
| Importar vários eventos | Menu de contexto do Explorer → **Importar Vários Eventos Globais** |

Arquivo salvo em `events/{eventId}.js`.

### Exportar

| Ação | Como acionar |
|---|---|
| Exportar evento global | Clique direito em arquivo dentro de `events/` → **Exportar Evento Global** |

### Excluir

| Ação | Como acionar |
|---|---|
| Excluir evento do servidor | Menu de contexto do Explorer → **Excluir Evento Global** |

### Criar

| Ação | Como acionar |
|---|---|
| Novo evento global (scaffold) | Menu de contexto do Explorer → **Novo Evento Global** |

### Diff

| Ação | Como acionar |
|---|---|
| Comparar local vs Fluig | Clique direito em arquivo dentro de `events/` → **Comparar com Fluig** |

---

## 5. Workflow — Processos e Mecanismos

### Editor de `.process` Inteligente

Arquivos `.process` (XMI Fluig) são registrados como linguagem dedicada `fluig-process` e ganham:

| Recurso | Como acionar |
|---|---|
| **Hover contextual** | Passar o mouse sobre o `id` de uma activity ou transition mostra tipo, nome, mecanismo de atribuição, papel/grupo, script associado (com link para abrir) e contagem de fluxos. |
| **CodeLens no topo do arquivo** | Linhas inline com botões `$(preview) Visualizar Workflow`, `$(checklist) Validar` e um resumo do processo (nome, versão, contagem de tarefas/serviços/gateways). |
| **Validar processo** | Botão CodeLens `$(checklist) Validar` ou Paleta → **Fluig: Validar Processo**. Detecta scripts ausentes, transitions órfãs, atividades sem fluxo de saída, loops no fluxo, datasets referenciados inexistentes e formulário vinculado ausente. |
| **Visualizar workflow** | Botão CodeLens `$(preview) Visualizar Workflow`, menu de contexto do Explorer no `.process` ou Paleta → **Fluig: Visualizar Workflow**. Abre painel SVG navegável ao lado. |

Hover sobre `scriptFileName="repair_shop.afterTaskSave.js"` mostra ✓ verde quando o arquivo está em `workflow/scripts/`, ou ⚠ quando ausente.

**Ctrl+Click** (links de documento) funciona sobre `scriptFileName="..."`, `process="..."` (sub-processo) e `cardIndex="..."` (formulário), abrindo o recurso correspondente no workspace.

### Preview Visual e Editor de Processo

Renderização SVG nativa do `.process` em um painel lateral com edição inline de propriedades (sem dependência de bpmn-js — usa coordenadas reais do XMI Fluig e patching cirúrgico do XML).

| Recurso | Comportamento |
|---|---|
| **Renderização** | Pool, swimlanes, tasks, service-tasks, gateways exclusivos, sub-processos, start/end events, intermediate links/errors e annotations — cada um com forma e cor distintas. |
| **Zoom & Pan** | Roda do mouse para zoom, arrastar para pan, botões `+`/`−`/`Fit` na toolbar. Indicador de zoom em %. |
| **Painel de propriedades** | Clicar em qualquer atividade abre o painel lateral direito com ID (somente leitura), tipo, campo editável de nome e (para service-task) campo editável de `scriptFileName`. |
| **Editar e salvar** | Alterar nome ou script no painel e clicar **Salvar** (ou pressionar Enter) atualiza o `.process` em disco sem reconstruir o XML — apenas o atributo alvo é substituído na linha correspondente. |
| **Abrir Script / Sub-processo** | Botões no painel de propriedades abrem o `.js` correspondente ou o preview recursivo do processo filho. |
| **Formulário vinculado** | O painel de propriedades exibe o formulário do processo (`cardIndex`) com botão **Abrir** que revela a pasta do formulário no Explorer. |
| **Overlay de validação** | Atividades com erros ganham stroke vermelho e badge numérico; avisos em laranja. O painel lista os issues da atividade selecionada. |
| **Tooltip** | Hover em qualquer elemento mostra ID, mecanismo de atribuição, papel/grupo, script, processo vinculado e problemas de validação. |
| **Auto-refresh** | Salvar o `.process` (manual ou via editor visual) re-renderiza o painel e re-executa validações automaticamente. |
| **Tema** | Toolbar respeita o tema do VS Code; canvas usa fundo claro fixo para legibilidade dos elementos BPMN. |

### SDK e CLI para CI/CD

O pacote `@fluiggers/sdk` expõe a API completa de processos para uso em pipelines de CI/CD e scripts externos, sem dependência do VS Code.

**Funções exportadas:**

| Função / Tipo | Descrição |
|---|---|
| `parseProcess(xml)` | Parseia um arquivo `.process` (string XML) e retorna `ProcessDefinition`. |
| `validateProcessDefinition(def, ctx)` | Valida um `ProcessDefinition` e retorna lista de `ValidationIssue`. |
| `ProcessDefinition`, `ProcessActivity`, `ProcessTransition`, ... | Tipos TypeScript completos do modelo. |

**CLI `fluig-validate-process`:**

Ferramenta de linha de comando instalada junto com o SDK para validar arquivos `.process` em pipelines CI/CD:

```bash
# Validar um arquivo
npx fluig-validate-process workflow/diagrams/approval.process

# Validar múltiplos arquivos
npx fluig-validate-process workflow/diagrams/*.process

# Saída JSON (para integração com outras ferramentas)
npx fluig-validate-process --json workflow/diagrams/*.process
```

Exit code 0 = sem erros; exit code 1 = há erros de validação.

**Exemplo de GitHub Actions:**

```yaml
- name: Validar processos Fluig
  run: npx fluig-validate-process workflow/diagrams/*.process
```

Painel lateral dedicado (aba **Workflows**) lista processos e seus eventos detectados localmente em `workflow/scripts/`.

### Eventos de Processo

| Ação | Como acionar |
|---|---|
| Exportar evento pelo painel | Clique direito no evento → **Exportar Evento** |
| Exportar pelo Explorer | Clique direito em `workflow/scripts/*.*.js` → **Exportar Evento de Processo** |
| Novo evento de processo | Clique direito em `.process` ou em `workflow/scripts/` → **Novo Evento de Processo** |
| Diff local vs Fluig | Clique direito em `workflow/scripts/*.*.js` → **Comparar com Fluig** |
| Diff pelo painel lateral | Clique direito no evento → **Comparar com Fluig** |

Formato do arquivo: `{processoId}.{nomeEvento}.js` em `workflow/scripts/`.

O painel escaneia automaticamente a pasta e atualiza em tempo real via `FileSystemWatcher`.

### Mecanismos de Atribuição

| Ação | Como acionar |
|---|---|
| Importar um mecanismo | Menu de contexto do Explorer → **Importar Mecanismo Customizado** |
| Importar vários mecanismos | Menu de contexto do Explorer → **Importar Vários Mecanismos Customizados** |
| Exportar mecanismo | Clique direito em `mechanisms/*.js` → **Exportar Mecanismo Customizado** |
| Novo mecanismo (scaffold) | Menu de contexto → **Novo Mecanismo Customizado** |
| Diff local vs Fluig | Clique direito em `mechanisms/*.js` → **Comparar com Fluig** |

Arquivo salvo em `mechanisms/{mechanismId}.js`.

---

## 6. Widgets

Painel lateral dedicado (aba **Widgets**) lista os widgets do servidor conectado.

| Ação | Como acionar |
|---|---|
| Novo widget (scaffold) | Menu de contexto do Explorer → **Novo Widget** |
| Importar widget | Menu de contexto do Explorer → **Importar Widget** |
| Importar pelo painel lateral | Clique direito no item → **Importar Widget** |
| Exportar widget | Clique direito em arquivo dentro de `widget/` → **Exportar Widget** |
| Instalar FluiggersWidget | Menu de contexto do servidor → **Exportar Fluiggers Widget** |

---

## 7. Status Bar

A barra de status inferior do VS Code exibe três indicadores Fluig em tempo real, sempre visíveis enquanto a extensão está ativa.

| Item | Exemplo | Comportamento |
|---|---|---|
| **Servidor** | `$(circle-filled) DEV` / `$(circle-outline) Fluig` | Nome do servidor conectado (ou "Fluig" quando desconectado). Clique para abrir o QuickPick de seleção de servidor. |
| **Watch** | `$(cloud-upload) Watch` / `$(circle-outline) Watch` | Estado do Auto Export. Fundo amarelo quando ativado. Clique para alternar. |
| **Deploys** | `$(loading~spin) 2` | Número de deploys em andamento. Aparece automaticamente quando há itens na fila e some quando a fila esvazia. |

O item de servidor atualiza automaticamente ao conectar ou desconectar; o contador de deploys atualiza em tempo real conforme a fila de export processa os arquivos.

---

## 8. Auto Export ao Salvar

Exporta automaticamente o artefato Fluig correspondente sempre que um arquivo for salvo.

**Tipos de arquivo monitorados:**

| Pasta | Artefato exportado |
|---|---|
| `datasets/*.js` | Dataset |
| `forms/**/*` | Formulário |
| `events/*.js` | Evento Global |
| `workflow/scripts/*.*.js` | Evento de Processo |
| `mechanisms/*.js` | Mecanismo Customizado |
| `widget/**/*` | Widget |

**Como ativar/desativar:** clique no ícone `$(cloud-upload) Fluig` ou `$(circle-outline) Fluig` na barra de status inferior. O estado é salvo por Workspace.

**Comportamento:**
- **Debounce de 500ms:** múltiplos saves rápidos disparam apenas uma exportação.
- **Deduplicação:** se o arquivo for salvo novamente antes do debounce expirar, o timer é reiniciado.
- **Retry automático:** até 2 tentativas com backoff exponencial em caso de falha de rede.
- **Fila serial:** cada arquivo exportado aguarda o anterior terminar — sem concorrência.
- **Cancelamento:** ao desativar a extensão, todas as exportações pendentes são canceladas.

---

## 9. Explorer Inteligente — Status e Diff

### Status de Sincronização

Badges visuais exibidos tanto no Explorer de arquivos quanto no painel lateral de **Datasets**:

| Badge | Significado | Cor |
|---|---|---|
| `✓` | Sincronizado com o Fluig | Verde |
| `M` | Alterado localmente — não exportado | Amarelo |
| `!` | Erro no último deploy | Vermelho |

O status é atualizado automaticamente via Event Bus:
- Após export bem-sucedido → `✓ synced`
- Após falha no export → `! error`
- Ao salvar o arquivo sem exportar → `M modified`
- Após import de um artefato → `✓ synced`

### Diff — Comparar Local vs Fluig

Abre o diff editor nativo do VS Code com o conteúdo remoto (Fluig) à esquerda e o arquivo local à direita.

| Artefato | Como acionar |
|---|---|
| **Dataset** | Clique direito em `datasets/*.js` → **Comparar com Fluig** |
| **Dataset** (painel) | Clique direito no item no painel → **Comparar com Fluig** |
| **Evento Global** | Clique direito em `events/*.js` → **Comparar com Fluig** |
| **Mecanismo** | Clique direito em `mechanisms/*.js` → **Comparar com Fluig** |
| **Evento de Processo** | Clique direito em `workflow/scripts/*.*.js` → **Comparar com Fluig** |
| **Evento de Processo** (painel) | Clique direito no evento no painel → **Comparar com Fluig** |

Requer um servidor conectado. O conteúdo remoto é buscado em tempo real via API do Fluig.

---

## 10. Runtime Local de Dataset

Executa o código de um dataset localmente (sem servidor) em uma sandbox isolada, ideal para testar a lógica de `createDataset` antes de exportar.

**Como acionar:** clique direito em `datasets/*.js` → **Executar Localmente**

**O que acontece:**
1. O código do dataset é executado em sandbox Node.js com mocks de `getValue`, `getRangeFilter`, etc.
2. `console.log` e outputs são exibidos no Output Channel `Fluig`.
3. O resultado (`dataset.rowsCount`) é exibido em tabela ASCII no Output Channel.
4. Erros de execução são exibidos com mensagem e stacktrace.

---

## 11. Snippets

Snippets disponíveis para acelerar a escrita de código Fluig.

### HTML (formulários Fluig)

| Snippet | Descrição |
|---|---|
| `fluig-input-text` | Campo de texto |
| `fluig-input-textarea` | Área de texto |
| `fluig-input-zoom` | Campo zoom |
| `fluig-switch-aprovacao` | Switch de aprovação |
| `fluig-input-data` | Campo de data |
| `fluig-panel` | Painel Bootstrap |
| `fluig-panel-collapse` | Painel colapsável |
| `fluig-tabs` | Abas Bootstrap |
| `fluig-radio` | Radio buttons |
| `fluig-radio-inline` | Radio buttons inline |
| `fluig-checkbox` | Checkbox |
| `fluig-checkbox-inline` | Checkbox inline |
| `fluig-checkbox-switch` | Checkbox estilo switch |
| `fluig-alert` | Alerta |
| `fluig-alert-dismissible` | Alerta com botão de fechar |
| `fluig-button-dropdown-split` | Botão dropdown split |
| `fluig-pai-filho` | Tabela pai-filho com botões |
| `fluig-pai-filho-nobuttons` | Tabela pai-filho sem botões |
| `fluig-pai-filho-panel` | Tabela pai-filho em painel |

### JavaScript (datasets, eventos, workflow)

| Snippet | Descrição |
|---|---|
| `fluig-paifilho-loop` | Loop sobre dados de tabela pai-filho |
| `fluig-paifilho-loop-workflow` | Loop pai-filho em contexto de workflow |
| `fluig-function-data` | Função de formatação de data |
| `fluig-consulta-jdbc` | Consulta JDBC no dataset |
| `fluig-consulta-jdbc-prepared` | Consulta JDBC com prepared statement |
| `fluig-calendar` | Seletor de data (datepicker) |
| `fluig-data-atual` | Data atual formatada |
| `fluig-beforeMovementOptions` | Evento `beforeMovementOptions` |
| `fluig-beforeSendValidate` | Evento `beforeSendValidate` |
| `fluig-zoom-selected` | Handler de seleção do zoom |
| `fluig-zoom-removed` | Handler de remoção do zoom |
| `fluig-dataset-async` | Chamada assíncrona de dataset |
| `fluig-modal` | Modal Bootstrap |
| `fluig-widget` | Estrutura base de widget |
| `fluig-soap-card-create` | Criação de ficha via SOAP |
| `fluig-soap-card-update` | Atualização de ficha via SOAP |

---

## 12. Biblioteca de Tipos

A extensão cria arquivos utilizando os tipos declarados na **Declaração de Tipos para o Fluig**, que habilita autocomplete e verificação de tipos no VS Code ao escrever datasets, eventos e workflows. Por isso, é recomendado que ela seja instalada no workspace.

**Como instalar:**

| Ação | Como acionar |
|---|---|
| Instalar via comando | Paleta de Comandos (`F1`) → **Fluig: Instalar Declarações de Tipo** |
| Instalar pelo painel de servidores | Clique direito no servidor → **Instalar Declarações de Tipo** |
| Instalar manualmente | Baixar o último release no GitHub e copiar os arquivos para o workspace |

Ao usar o comando ou o menu de contexto do servidor, a extensão baixa automaticamente os arquivos de declaração para o workspace/diretório atual.

---

## 13. Configurações

Configurações disponíveis em `Arquivo > Preferências > Configurações > Extensões > Fluiggers`.

| Configuração | Tipo | Padrão | Descrição |
|---|---|---|---|
| `fluiggers.browserPath` | `string` | `""` | Caminho do executável do navegador para autenticação MFA (Chromium ou Firefox) |
| `fluiggers.serverConfigPath` | `string` | `""` | Caminho alternativo para o arquivo de configuração de servidores (padrão: `.vscode/fluig-servers.json` no workspace) |
| `fluiggers.autoExportOnSave` | `boolean` | `false` | Exporta automaticamente ao salvar arquivos dos artefatos Fluig |

---

## Estrutura de Pastas Esperada no Workspace

```
{workspace}/
├── datasets/          ← Datasets (.js)
├── events/            ← Eventos Globais (.js)
├── forms/
│   └── {NomeForm}/    ← HTML + arquivos de eventos do formulário
├── mechanisms/        ← Mecanismos Customizados (.js)
├── widget/
│   └── {codigoWidget}/
└── workflow/
    └── scripts/       ← Eventos de processo ({processo}.{evento}.js)
```

---

## Output Channel

Todos os logs da extensão são exibidos no Output Channel **Fluig** (`Exibir > Output > Fluig`).

Os logs são prefixados por namespace para facilitar o diagnóstico:

| Prefixo | Origem |
|---|---|
| `[SYNC]` | Sincronização de artefatos (import/export) |
| `[WATCH]` | Auto Export ao salvar |
| `[DEPLOY]` | Fila de deploy (retries) |
| `[AUTH]` | Autenticação no servidor |
| `[HTTP]` | Chamadas HTTP (retry 401) |
| `[DATASET]` | Serviço de datasets |
| `[FORM]` | Serviço de formulários |
| `[WORKFLOW]` | Serviço de workflow |
| `[WIDGET]` | Serviço de widgets |
| `[EVENT]` | Serviço de eventos globais |
| `[HEALTH]` | Teste de conexão |
| `[RUNTIME]` | Execução local de dataset |
| `[SERVER]` | Conexão/desconexão de servidor |
