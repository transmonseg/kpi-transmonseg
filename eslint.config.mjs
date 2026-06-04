import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts arquivados (one-off já executados, mantidos só por histórico) —
    // não fazem parte da app e não valem lint.
    "scripts/_archive/**",
  ]),
  {
    // Convenção: variáveis/args/erros prefixados com "_" são intencionalmente
    // não usados (placeholders, params de assinatura) e não devem ser flagrados.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    // Regras novas/estritas do React Compiler (via eslint-config-next) que
    // sinalizam padrões válidos no código atual (effects de mount/timer,
    // acumulador local em render). Mantidas como AVISO (visíveis) até um
    // refactor dedicado de React 19, em vez de erro que trava o lint. Escopadas
    // aos componentes (.jsx/.tsx), onde o plugin react-hooks está disponível.
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Testes usam `any` legitimamente em mocks/stubs (ex: cliente Supabase fake,
    // linhas de escala parciais). Não force tipagem completa de fixture.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Tooling operacional (scripts de db/dev e servidor MCP): não é código da app.
    // `any`/`require` são aceitáveis em script utilitário; unused vira aviso.
    files: ["scripts/**/*.{ts,tsx,js,mjs,cjs}", "mcp/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
]);

export default eslintConfig;
