import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "docs-site", "node_modules", "src/generated"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='fromSecret']",
          message:
            "@stellar-aid/sdk must never construct signers from raw secret keys (Keypair.fromSecret). Delegate signing to a wallet adapter or ServerSigner.",
        },
        {
          selector:
            "TSPropertySignature[key.name=/^(secretKey|signerKey|privateKey|secretSeed)$/], Identifier[name=/^(secretKey|signerKey|privateKey|secretSeed)$/]",
          message: "No @stellar-aid/sdk function or option type may accept a secret key parameter.",
        },
      ],
    },
  },
);
