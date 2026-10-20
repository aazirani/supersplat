import playcanvasConfig from '@playcanvas/eslint-config';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { SourceCode } from 'eslint';
import globals from 'globals';

// eslint-plugin-import (pinned by @playcanvas/eslint-config 2.x) still calls the
// SourceCode token helpers that ESLint 10 removed; without them any import/order
// fix crashes the lint run. Polyfill the two it uses so the rule reports instead.
const sourceCodeProto = SourceCode.prototype;
if (!sourceCodeProto.getTokenOrCommentAfter) {
    sourceCodeProto.getTokenOrCommentAfter = function (nodeOrToken) {
        return this.getTokenAfter(nodeOrToken, { includeComments: true });
    };
    sourceCodeProto.getTokenOrCommentBefore = function (nodeOrToken) {
        return this.getTokenBefore(nodeOrToken, { includeComments: true });
    };
}

export default [
    ...playcanvasConfig,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            globals: {
                ...globals.browser,
                ...globals.serviceworker,
                BlobPart: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        settings: {
            'import/resolver': {
                typescript: {}
            }
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/require-returns-type': 'off',
            'jsdoc/check-tag-names': 'off',
            'lines-between-class-members': 'off',
            'no-await-in-loop': 'off',
            'require-atomic-updates': 'off'
        }
    }, {
        // The experience's pure modules are run unbundled by node --test, so their relative
        // imports carry the .ts extension (rewriteRelativeImportExtensions rewrites them for
        // the bundle).
        files: [
            'src/experience/types.ts',
            'src/experience/screen-fit.ts',
            'src/experience/experience-settings.ts',
            'src/experience/experience-doc.ts',
            'src/experience/experience-ops.ts'
        ],
        rules: {
            'import/extensions': ['error', 'ignorePackages', { '.ts': 'always' }]
        }
    }, {
        files: ['**/*.mjs'],
        languageOptions: {
            globals: {
                ...globals.node
            }
        },
        rules: {
            'import/no-unresolved': 'off'
        }
    }
];
