import { afterEach, describe, expect, it } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveWorkspacePath, workspaceRoot } from "../src/runtime.js";

/**
 * `pnpm dev` starts each service inside apps/<name>, but .env paths such as
 * .local/services/notification-svc/signer.json are relative to the repository root. Without this
 * resolution the notification worker could not read its signer file and every contact lookup
 * failed ("Contact lookup is unavailable").
 */
const original = process.cwd();
const created: string[] = [];
afterEach(() => {
  process.chdir(original);
  for (const dir of created.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fakeWorkspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sd-ws-")));
  created.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  const app = join(root, "apps", "notification-svc");
  mkdirSync(app, { recursive: true });
  return { root, app };
}

describe("workspace path resolution", () => {
  it("resolves a repo-root-relative path from inside an app directory", () => {
    const { root, app } = fakeWorkspace();
    process.chdir(app);
    expect(workspaceRoot()).toBe(root);
    expect(
      resolveWorkspacePath(".local/services/notification-svc/signer.json"),
    ).toBe(resolve(root, ".local/services/notification-svc/signer.json"));
  });

  it("leaves an absolute path unchanged", () => {
    const { app } = fakeWorkspace();
    process.chdir(app);
    const absolute = resolve(tmpdir(), "somewhere", "signer.json");
    expect(resolveWorkspacePath(absolute)).toBe(absolute);
  });

  it("falls back to the current directory outside a workspace", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "sd-nows-")));
    created.push(dir);
    process.chdir(dir);
    expect(workspaceRoot()).toBeUndefined();
    expect(resolveWorkspacePath("a/b.json")).toBe(resolve(dir, "a/b.json"));
  });
});
