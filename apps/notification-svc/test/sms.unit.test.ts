import { describe, expect, it, jest } from "@jest/globals";
import { parseNotificationConfig } from "../src/config.js";
import {
  createSmsSender,
  TextLkSmsSender,
  textLkRecipient,
} from "../src/sms.js";
import { MockSmsSender } from "../src/senders.js";

const message = {
  recipient: "+94771234567",
  body: "SwiftDrop booking confirmed",
  eventId: "event-id",
};
const token = "test-private-api-token";
const success = {
  status: "success",
  data: { uid: "sms_123", status: "Delivered" },
};

describe("Text.lk SMS", () => {
  it.each(["+94771234567", "94771234567", "0771234567"])(
    "normalizes %s for a single mobile send",
    (number) => {
      expect(textLkRecipient(number)).toBe("94771234567");
    },
  );

  it.each([
    "+12025550123",
    "0112345678",
    "94771234567,94761234567",
    "94771234567\n94761234567",
  ])(
    "rejects invalid or bulk recipient %s before any API request",
    async (recipient) => {
      const request = jest.fn<typeof fetch>();
      const sender = new TextLkSmsSender(
        token,
        "TextLKDemo",
        { info: jest.fn() },
        request,
      );
      await expect(sender.send({ ...message, recipient })).rejects.toThrow(
        "SMS_RECIPIENT_INVALID",
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("uses Bearer authentication and the documented JSON API without logging secrets or contacts", async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(success)));
    const info = jest.fn();
    const sender = new TextLkSmsSender(token, "TextLKDemo", { info }, request);
    await expect(sender.send(message)).resolves.toEqual({
      providerMessageId: "sms_123",
    });
    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe("https://app.text.lk/api/v3/sms/send");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options?.body as string)).toEqual({
      recipient: "94771234567",
      sender_id: "TextLKDemo",
      type: "plain",
      message: message.body,
    });
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).toContain("***4567");
    for (const secret of [
      token,
      message.recipient,
      "94771234567",
      message.body,
    ])
      expect(logs).not.toContain(secret);
  });

  it.each([
    [401, { status: "error", message: token + message.recipient }],
    [200, { status: "error", message: "Insufficient credit" }],
    [200, { status: "success", data: { uid: "sms_123", status: "Failed" } }],
    [200, { status: "success", data: {} }],
    [200, { status: "success", data: { uid: message.recipient } }],
  ])(
    "rejects provider failures without echoing the response (%s)",
    async (status, payload) => {
      const request = jest
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
      const info = jest.fn();
      await expect(
        new TextLkSmsSender(token, "TextLKDemo", { info }, request).send(
          message,
        ),
      ).rejects.toThrow("SMS_PROVIDER_REJECTED");
      expect(info).not.toHaveBeenCalled();
    },
  );

  it.each(["network", "invalid JSON"])(
    "turns %s into a sanitized retryable failure",
    async (failure) => {
      const request = jest.fn<typeof fetch>();
      if (failure === "network")
        request.mockRejectedValue(new Error(token + message.recipient));
      else request.mockResolvedValue(new Response("not JSON"));
      await expect(
        new TextLkSmsSender(
          token,
          "TextLKDemo",
          { info: jest.fn() },
          request,
        ).send(message),
      ).rejects.toThrow("SMS_PROVIDER_UNAVAILABLE");
    },
  );
});

describe("SMS provider configuration", () => {
  const base = { DATABASE_URL: "postgresql://test:test@localhost:5432/test" };
  it("defaults to the mock adapter", () => {
    expect(
      createSmsSender(parseNotificationConfig(base), { info: jest.fn() }),
    ).toBeInstanceOf(MockSmsSender);
  });
  it("requires credentials and sender ID when real SMS is enabled", () => {
    expect(() =>
      parseNotificationConfig({ ...base, SMS_PROVIDER: "textlk" }),
    ).toThrow();
    expect(() =>
      parseNotificationConfig({
        ...base,
        SMS_PROVIDER: "textlk",
        TEXTLK_API_TOKEN: token,
        TEXTLK_SENDER_ID: "bad\nsender",
      }),
    ).toThrow();
    const config = parseNotificationConfig({
      ...base,
      SMS_PROVIDER: "textlk",
      TEXTLK_API_TOKEN: token,
      TEXTLK_SENDER_ID: "TextLKDemo",
    });
    expect(createSmsSender(config, { info: jest.fn() })).toBeInstanceOf(
      TextLkSmsSender,
    );
  });
});
