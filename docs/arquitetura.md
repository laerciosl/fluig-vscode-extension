# Arquitetura do Projeto — Fluig VSCode Extension

Extensão VS Code para desenvolvimento na plataforma **TOTVS Fluig**. Permite criar, importar e exportar artefatos Fluig (datasets, formulários, eventos globais, processos/mecanismos, widgets) diretamente do editor, sem precisar acessar o portal Fluig manualmente.

---

## Visão Geral

```
src/
├── extension.ts              ← entry point (activate/deactivate)
├── types/                    ← interfaces compartilhadas (sem dependência de vscode)
├── sdk/                      ← cliente Fluig puro (sem dependência de vscode)
├── fluig/                    ← orquestração de domínio (usa sdk/ + vscode UI)
└── core/                     ← camada VS Code (comandos, views, providers, geradores)
```

A dependência flui em uma única direção:

```
core/ → fluig/ → sdk/ → types/
```

Nenhuma camada inferior importa de uma superior.

---

## Camadas

### `src/types/` — Interfaces Compartilhadas

Tipos e interfaces puras, sem lógica, sem dependência de `vscode` ou de qualquer serviço.

| Arquivo | Conteúdo |
|---|---|
| `server.types.ts` | `ServerDTO`, `ServerConfig` |
| `auth.types.ts` | `CookieCache`, `JwtPayload` |
| `api.types.ts` | `FluigApiResponse<T>`, `FluigListResponse<T>` |
| `common.types.ts` | `DeepPartial<T>` |

---

### `src/sdk/` — Cliente Fluig (sem VS Code)

Chamadas HTTP/SOAP brutas à API do Fluig. Sem lógica de UX, sem imports de `vscode`. Pode ser reutilizado fora da extensão.

```
sdk/
├── hapi/
│   ├── http.client.ts    ← getHost(), getRestUrl(), fillServerFromJwtCookies(), validateServerHasFluiggersWidget()
│   ├── login.client.ts   ← loginAndGetCookies(), createAuthenticatedClientAsync(), clearCookies()
│   └── user.client.ts    ← getUser()
├── dataset/
│   └── dataset.api.ts    ← apiFindAllDatasets(), apiLoadDataset(), apiGetDatasetResult(), apiCreateDataset(), apiUpdateDataset()
└── workflow/
    └── workflow.api.ts   ← apiGetLastWorkflowVersion(), apiUpdateWorkflowEvents()
```

**Autenticação**: `login.client.ts` mantém um cache em memória de cookies por servidor. Suporta autenticação via HAPI (usuário/senha) e via navegador (Puppeteer, para servidores com MFA habilitado). A senha é descriptografada com AES-256-CBC antes de enviar.

---

### `src/fluig/` — Orquestração de Domínio

Coordena chamadas ao `sdk/`, lida com lógica de negócio do domínio Fluig e aciona UX do VS Code (progress bars, quick picks, mensagens de erro).

Cada subdomínio tem sua própria pasta com até 4 papéis:

| Sufixo | Papel |
|---|---|
| `.service.ts` | Orquestra import/export, chama sdk/, exibe progress e mensagens |
| `.types.ts` | DTOs e interfaces específicas do domínio |
| `.mapper.ts` | Transforma dados brutos da API em estruturas do domínio |
| `.validator.ts` | Validações de input (ex: nome único de dataset) |

```
fluig/
├── datasets/   dataset.service, dataset.types, dataset.mapper, dataset.validator
├── forms/      form.service, form.types, form.mapper
├── events/     global-event.service, global-event.types
├── workflow/   workflow.service (WorkflowService + AttributionMechanismService unificados), workflow.types, workflow.mapper
└── widgets/    widget.service, widget.types
```

---

### `src/core/` — Camada VS Code

Tudo que tem dependência direta do VS Code API. Dividida em subpastas por responsabilidade:

#### `core/commands/` — Registro de Comandos

Um arquivo por domínio, cada um exporta uma função `register*Commands(context)` chamada em `extension.ts`.

| Arquivo | Função exportada |
|---|---|
| `dataset.commands.ts` | `registerDatasetCommands` |
| `form.commands.ts` | `registerFormCommands` |
| `global-event.commands.ts` | `registerGlobalEventCommands` |
| `workflow.commands.ts` | `registerWorkflowCommands` |
| `widget.commands.ts` | `registerWidgetCommands` |
| `server.commands.ts` | `registerServerCommands` (async — verifica versão do config) |
| `library.commands.ts` | `registerLibraryCommands` |

#### `core/generators/` — Criação de Artefatos Locais

Cria arquivos a partir de templates, sem chamar servidor. Acionados via comando quando o usuário cria um novo artefato.

| Arquivo | Função(ões) |
|---|---|
| `dataset.generator.ts` | `createDataset()` |
| `form.generator.ts` | `createForm()`, `createFormEvent()` |
| `global-event.generator.ts` | `createGlobalEvent()` |
| `workflow.generator.ts` | `createWorkflowEvent()`, `createMechanism()` |
| `widget.generator.ts` | `createWidget()` |

#### `core/views/` — WebviewPanel

| Arquivo | Classe |
|---|---|
| `server.view.ts` | `ServerView` — formulário de cadastro/edição de servidor |
| `dataset.view.ts` | `DatasetView` — interface de consulta de datasets |

#### `core/providers/` — TreeDataProvider

| Arquivo | Classes |
|---|---|
| `server-item.provider.ts` | `ServerItemProvider`, `ServerItem`, `DatasetItem` — lista lateral de servidores |

O `ServerItemProvider` assiste o arquivo de configuração via `fs.watch` e atualiza a árvore automaticamente ao detectar mudanças.

#### Utilitários de Core

| Arquivo | Exports principais |
|---|---|
| `crypto.service.ts` | `encrypt(text)`, `decrypt(encrypted)` — AES-256-CBC usando `env.machineId` |
| `global-storage.ts` | `getLastParentDocumentId()`, `updateLastParentDocumentId()` — VS Code globalState |
| `template.service.ts` | `TemplateService` — URIs e nomes de templates (inicializado em `extension.ts`) |
| `workspace.utils.ts` | `getWorkspaceUri()`, `generateRandomId()`, `confirmPassword()` |
| `server.service.ts` | CRUD de servidores no arquivo JSON de configuração |
| `server.model.ts` | Classe `Server` — implementa `ServerDTO`, criptografa/descriptografa senha |

---

## Configuração de Servidores

Os servidores são armazenados em um arquivo JSON (`fluig-servers.json`). O caminho padrão é `.vscode/fluig-servers.json` no workspace, mas pode ser sobrescrito pela configuração `fluiggers.serverConfigPath` (global). A versão do arquivo é verificada no startup da extensão.

Cada servidor (`ServerDTO`) tem: `id`, `name`, `host`, `ssl`, `port`, `username`, `password` (criptografada), `userCode`, `confirmExporting`, `hasBrowser`, `companyId`.

---

## Templates

Templates residem em `resources/templates/` e são copiados para `dist/templates/` pelo Gulp no build. Subpastas:

- `formEvents/` — eventos de formulário (`.js`)
- `workflowEvents/` — eventos de workflow (`.js`)
- `globalEvents/` — eventos globais (`.js`)
- `widget/` — estrutura base de um widget Fluig (diretório copiado integralmente)
- Raiz: `createDataset.js`, `createMechanism.js`, `form.html`

O `TemplateService` é inicializado em `extension.ts` com as URIs dos diretórios de templates e escaneia os nomes disponíveis via glob.

---

## Build

O projeto usa dois passos de build em sequência:

1. **Gulp** (`gulpfile.js`) — copia templates, imagens e a lib `puppeteer-core` para `dist/`
2. **Webpack** (`webpack.config.js`) — empacota TypeScript em `dist/extension.js`

```bash
npm run compile       # Gulp + Webpack (produção)
npm run watch         # Webpack em modo watch
npm run test-compile  # tsc sem emissão (verificação de tipos)
npm run lint          # ESLint
```

O entry point do Webpack é `src/extension.ts`. Os módulos Node nativos e o `vscode` são externalizados (não empacotados).
