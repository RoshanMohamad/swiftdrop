import { describe, expect, it } from "@jest/globals";
import { PassThrough, Writable } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { readAdminInput } from "../src/modules/users/admin-prompt.js";

const secret = "Unique operator passphrase!";
function terminal(answers: string[], onPrompt?: (label: string) => void) {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode(value: boolean) {
      this.isRaw = value;
      return this;
    },
  });
  let captured = "";
  let index = 0;
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        const text = chunk.toString();
        captured += text;
        if (
          [
            "Full name: ",
            "Email: ",
            "Sri Lankan phone: ",
            "Password (hidden): ",
            "Confirm password (hidden): ",
          ].includes(text)
        ) {
          queueMicrotask(() => {
            onPrompt?.(text);
            if (index < answers.length) input.write(answers[index++] + "\r");
          });
        }
        done();
      },
    }),
    { isTTY: true },
  );
  return {
    input: input as unknown as ReadStream,
    output: output as unknown as WriteStream,
    captured: () => captured,
  };
}

describe("operator admin prompt", () => {
  it("hides both password entries, validates/canonicalizes input and restores terminal mode", async () => {
    const tty = terminal([
      "Example Admin",
      " OPERATOR@EXAMPLE.TEST ",
      "0771234567",
      secret,
      secret,
    ]);
    expect(await readAdminInput(tty.input, tty.output)).toEqual({
      fullName: "Example Admin",
      email: "operator@example.test",
      phone: "+94771234567",
      password: secret,
    });
    expect(tty.captured()).not.toContain(secret);
    expect(tty.input.isRaw).toBe(false);
  });
  it("restores terminal mode and never prints validation input on mismatch", async () => {
    const tty = terminal([
      "Example Admin",
      "operator@example.test",
      "0771234567",
      secret,
      "different secret",
    ]);
    await expect(readAdminInput(tty.input, tty.output)).rejects.toThrow(
      "Passwords do not match",
    );
    expect(tty.captured()).not.toContain(secret);
    expect(tty.captured()).not.toContain("different secret");
    expect(tty.input.isRaw).toBe(false);
  });
  it("shows safe field guidance for invalid input", async () => {
    const tty = terminal([
      "Example Admin",
      "operator@example.test",
      "0771234567",
      "short",
      "short",
    ]);
    await expect(readAdminInput(tty.input, tty.output)).rejects.toThrow(
      "Use at least 15 characters",
    );
    expect(tty.captured()).not.toContain("short");
  });
  it.each(["interrupt", "abort", "eof"])(
    "cancels on %s and restores terminal state",
    async (kind) => {
      const controller = new AbortController();
      const tty = terminal(
        ["Example Admin", "operator@example.test", "0771234567"],
        (label) => {
          if (label === "Password (hidden): ") {
            if (kind === "abort") controller.abort();
            else tty.input.push(kind === "interrupt" ? "\u0003" : "\u0004");
          }
        },
      );
      await expect(
        readAdminInput(tty.input, tty.output, controller.signal),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(tty.input.isRaw).toBe(false);
    },
  );
  it("refuses redirected input/output before reading secrets", async () => {
    const tty = terminal([]);
    Object.defineProperty(tty.input, "isTTY", { value: false });
    await expect(readAdminInput(tty.input, tty.output)).rejects.toThrow(
      "interactive terminal",
    );
    expect(tty.captured()).toBe("");
  });
});
