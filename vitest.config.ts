import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            vscode: path.resolve(__dirname, 'tests/__mocks__/vscode.ts'),
            '@fluiggers/sdk': path.resolve(__dirname, 'packages/sdk/src/index.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts', 'packages/sdk/src/**/*.ts'],
            exclude: ['src/extension.ts', 'src/core/commands/**', 'src/core/views/**'],
        },
    },
});
