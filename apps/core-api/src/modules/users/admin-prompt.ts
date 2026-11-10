import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { registrationSchema } from "@swiftdrop/contracts";

export class AdminInputError extends Error {}

export async function readAdminInput(
  input: ReadStream,
  output: WriteStream,
  signal?: AbortSignal,
) {
  if (!input.isTTY || !output.isTTY)
    throw new AdminInputError(
      "Admin creation requires an interactive terminal.",
    );
  let hidden = false;
  const wasRaw = input.isRaw;
  const muted = new Writable({
    write(chunk, _encoding, done) {
      if (!hidden) output.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input, output: muted, terminal: true });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  rl.on("SIGINT", cancel);
  rl.on("close", cancel);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  async function ask(label: string, secret = false) {
    output.write(label);
    hidden = secret;
    try {
      return await rl.question("", { signal: controller.signal });
    } finally {
      hidden = false;
      if (secret) output.write("\n");
    }
  }
  try {
    const fullName = await ask("Full name: ");
    const email = await ask("Email: ");
    const phone = await ask("Sri Lankan phone: ");
    const password = await ask("Password (hidden): ", true);
    const confirmation = await ask("Confirm password (hidden): ", true);
    if (password !== confirmation)
      throw new AdminInputError("Passwords do not match.");
    const parsed = registrationSchema.safeParse({
      fullName,
      email,
      phone,
      password,
    });
    if (!parsed.success)
      throw new AdminInputError(
        parsed.error.issues
          .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
          .join("\n"),
      );
    return parsed.data;
  } finally {
    signal?.removeEventListener("abort", cancel);
    rl.close();
    input.setRawMode(wasRaw);
    muted.end();
  }
}
