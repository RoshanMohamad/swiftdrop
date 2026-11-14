import { z } from "zod";
import pino from "pino";
import { createApp } from "./app.js";
import { SwiftDropApi } from "./rest.js";

const env = z
  .object({
    AI_ASSISTANT_PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    HOST: z.string().min(1).default("127.0.0.1"),
    CORE_API_URL: z.url().default("http://127.0.0.1:3000"),
  })
  .parse(process.env);

const logger = pino({ redact: ["req.headers.authorization", "authorization"] });
const app = createApp(new SwiftDropApi(env.CORE_API_URL));
const server = app.listen(env.AI_ASSISTANT_PORT, env.HOST, () =>
  logger.info({ event: "started", port: env.AI_ASSISTANT_PORT }),
);
const stop = () => {
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
