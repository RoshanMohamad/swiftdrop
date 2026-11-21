const base = {
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, tsconfig: "tsconfig.json" }],
  },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  testTimeout: 180000,
};
module.exports = {
  projects: [
    {
      ...base,
      displayName: "unit",
      testMatch: ["<rootDir>/test/*.unit.test.ts"],
    },
    {
      ...base,
      displayName: "integration",
      testMatch: ["<rootDir>/test/*.integration.test.ts"],
    },
  ],
  // Service and domain layers (claude.md: at least 80% line coverage). Routes and adapters are
  // exercised through them, so they are left out of the measure rather than padded in.
  collectCoverageFrom: [
    "src/modules/**/service.ts",
    "src/modules/pricing/strategy.ts",
    "src/modules/dispatch/capacity.ts",
    "src/modules/auth/jwt.ts",
    "src/modules/auth/password.ts",
    "src/modules/auth/cleanup.ts",
    "src/modules/auth/transactions.ts",
    "src/modules/users/admin.ts",
    "src/modules/services/auth.ts",
    "src/modules/services/notifications.ts",
    "src/modules/services/webhooks.ts",
    "src/modules/services/signing.ts",
    "src/modules/merchants/webhook-security.ts",
  ],
  coverageThreshold: { global: { lines: 80 } },
};
