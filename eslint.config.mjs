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
  ]),
  {
    rules: {
      // Apostrophes/guillemets français dans le JSX : bruit cosmétique, géré
      // correctement par React au runtime (la règle est retirée des configs
      // Next récentes).
      "react/no-unescaped-entities": "off",
      // Règles récentes du React Compiler (eslint-plugin-react-hooks v6) :
      // gardées en avertissement plutôt qu'en erreur bloquante.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
