{
  "env": {
    "es2022": true,
    "node": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:node/recommended",
    "plugin:prettier/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "plugins": ["import", "node", "prettier"],
  "rules": {
    "prettier/prettier": "error",
    "no-console": "warn",
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "node/no-missing-require": "off",
    "node/no-extraneous-require": "off",
    "node/file-extension-in-import": "off",
    "import/no-extraneous-dependencies": ["error", {"devDependencies": ["**/test/**", "**/*.test.js"]}]
  },
  "ignorePatterns": ["node_modules/", "dist/", "coverage/"]
}