const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

module.exports = tseslint.config(
    {
        ignores: ['dist/**', 'extension/dist/**', 'node_modules/**']
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: './extension/tsconfig.json',
                tsconfigRootDir: __dirname,
                sourceType: 'module',
                ecmaVersion: 'latest'
            },
            globals: {
                ...globals.browser,
                chrome: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin
        },
        rules: {
            ...eslint.configs.recommended.rules,
            ...tseslint.configs.strictTypeChecked.rules,
            ...tseslint.configs.stylisticTypeChecked.rules,

            'no-undef': 'off',
            'no-var': 'error',
            'prefer-const': ['error', { destructuring: 'all' }],
            'prefer-arrow-callback': 'error',
            'prefer-template': 'error',

            'eqeqeq': ['error', 'always'],
            'no-implicit-coercion': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-throw-literal': 'error',

            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],

            '@typescript-eslint/no-explicit-any': [
                'error',
                { ignoreRestArgs: true }
            ],
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true
                }
            ],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', disallowTypeAnnotations: false }
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            'no-console': 'warn'
        }
    },
    {
        files: ['**/*.{js,cjs,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: {
            ...eslint.configs.recommended.rules,

            'no-var': 'error',
            'prefer-const': ['error', { destructuring: 'all' }],
            'prefer-arrow-callback': 'error',
            'prefer-template': 'error',

            'eqeqeq': ['error', 'always'],
            'no-implicit-coercion': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-throw-literal': 'error',

            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            'no-console': 'warn'
        }
    }
);
