import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSignerPrivateKey } from "../src/lookup.js";

let directory: string | undefined;

afterEach(async () => {
  if (directory) await rm(directory, { force: true, recursive: true });
  directory = undefined;
});

describe("notification signer files", () => {
  it("finds a mounted sibling key when metadata contains a host path", async () => {
    directory = await mkdtemp(join(tmpdir(), "swiftdrop-notification-"));
    const metadataFile = join(directory, "signer.json");
    await writeFile(join(directory, "notification-key.pem"), "PRIVATE KEY");

    await expect(
      readSignerPrivateKey(
        metadataFile,
        "C:\\host\\ignored\\notification-key.pem",
      ),
    ).resolves.toBe("PRIVATE KEY");
  });
});
