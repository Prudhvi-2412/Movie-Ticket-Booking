module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended'
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // The codebase leans on prop spreading and children typing that
    // prop-types cannot express usefully; TypeScript would be the real fix.
    'react/prop-types': 'off',
    // Only the characters that genuinely break JSX parsing. Apostrophes and
    // quotes render correctly and reading &apos; in prose is worse than the
    // problem the default rule guards against.
    'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error'
  },
  overrides: [
    {
      // Providers deliberately export their hook alongside the component;
      // splitting them would just make every consumer import from two files.
      files: ['src/context/**/*.jsx', 'src/components/ui/index.jsx'],
      rules: { 'react-refresh/only-export-components': 'off' }
    }
  ]
};
