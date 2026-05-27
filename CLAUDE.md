# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A VS Code extension (published as `fluiggers-fluig-vscode-extension`) that speeds up development for the TOTVS Fluig platform. It lets developers import/export Fluig artifacts (datasets, forms, widgets, mechanisms, workflow events, global events) directly from VS Code via context menus, keyboard shortcuts, and a sidebar server panel.

## Build commands

```bash
# Full build (gulp + webpack production)
npm run package

# Development build (watches for changes)
npm run watch

# Compile TypeScript only (outputs to out/)
npm run test-compile

# Lint
npm run lint

# Tests (requires test-compile first)
npm test

# Rebuild only gulp-managed resources (CSS, JS, images, templates)
npm run buildResources

# Rebuild only third-party libraries (jQuery, Bootstrap, Select2, DataTables)
npm run buildLibraries
```

The build is a two-step pipeline:

1. **Gulp** (`gulpfile.js`): copies/minifies third-party libs from `node_modules` and project resources from `resources/` into `dist/`. Runs automatically via `precompile` before webpack.
2. **Webpack** (`webpack.config.js`): bundles `src/extension.ts` into `dist/extension.js`.

The `dist/` folder is the extension's runtime output and is `.gitignore`d. Always run a full build before packaging/publishing.

## Architecture

### Layer breakdown

Dependency flows in one direction only: `core/ → fluig/ → sdk/ → types/`. No lower layer imports from a higher one.

```
src/
  extension.ts          — activate() entry point; calls register*Commands() functions
  types/                — shared interfaces only (no vscode dependency)
  sdk/                  — raw Fluig HTTP/SOAP client (no vscode dependency)
  fluig/                — domain orchestration (uses sdk/ + vscode UI)
  core/                 — VS Code layer (commands, views, providers, generators)

resources/              — raw HTML/CSS/JS for webviews; gulp copies them to dist/
templates/              — JS/HTML scaffold files used when creating new artifacts
snippets/               — VS Code snippet contributions (HTML, JavaScript, FTL)
```

### How a feature flows

Each Fluig artifact type follows the same pattern:

1. `core/commands/*.commands.ts` registers VS Code commands via `register*Commands(context)`.
2. Commands call `fluig/<domain>/*.service.ts`, which orchestrates UX (progress, quick picks) and calls `sdk/` for API calls.
3. Authentication goes through `sdk/hapi/login.client.ts`: standard `fetch`-based form login, or Puppeteer browser login for MFA-enabled servers. Cookies are cached in memory per server session.
4. Passwords at rest are encrypted with AES-256-CBC via `core/crypto.service.ts`, using `env.machineId` as the key derivation input — so the config file is machine-specific.

### Domain file roles

Each domain folder under `fluig/` uses up to four file roles:

| Suffix | Responsibility |
|---|---|
| `.service.ts` | Orchestrates import/export; calls sdk/, shows VS Code UI |
| `.types.ts` | DTOs and domain-specific interfaces |
| `.mapper.ts` | Transforms raw API data into domain structures |
| `.validator.ts` | Input validation (e.g. unique dataset name loop) |

### Server configuration file

Stored at `.vscode/fluig-servers.json` in the workspace by default; can be redirected via the `fluiggers.serverConfigPath` VS Code setting. The `ServerItemProvider` registers a file-system watcher on that file so the sidebar refreshes automatically on external changes.

### Webview panels

`ServerView` and `DatasetView` load HTML templates from `dist/views/` using the `template-literal` package for variable substitution. All third-party JS/CSS assets (jQuery, Bootstrap 5, Select2, DataTables) are bundled by Gulp into `dist/libs/` and injected as `asWebviewUri` references.

## After every change

After any code change, always run the tests and fix failures before reporting the task as done:

```bash
npm run test:unit
npm run test:integration
```

If any test fails, investigate the root cause and fix it — do not skip or comment out failing tests.

## Key conventions

- **Module-level functions, not static classes**: service files export plain functions. Do not create static-only classes for services.
- **Commands register, services execute**: `core/commands/*.commands.ts` files only register VS Code commands; all I/O and Fluig API calls live in `fluig/` or `sdk/`.
- **No generic file names**: always prefix with the domain. `types.ts`, `interfaces.ts`, and `dto.ts` are forbidden — use `dataset.types.ts`, `workflow.types.ts`, `api.types.ts` instead.
- **Context menu visibility** is driven by `resourcePath` regex patterns in `package.json` `menus.explorer/context`. When adding a new file type, update the `when` clauses there.
- **TypeScript strict mode** is enabled. All new code must satisfy strict null checks.
- The project UI is in Brazilian Portuguese — keep user-facing strings, error messages, and prompts in pt-BR.
