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
  collectCoverageFrom: [
    "src/modules/auth/service.ts",
    "src/modules/auth/jwt.ts",
    "src/modules/auth/password.ts",
    "src/modules/auth/cleanup.ts",
    "src/modules/auth/transactions.ts",
    "src/modules/users/service.ts",
    "src/modules/users/admin.ts",
    "src/modules/services/auth.ts",
    "src/modules/services/notifications.ts",
    "src/modules/services/signing.ts",
  ],
  coverageThreshold: { global: { lines: 80 } },
};
