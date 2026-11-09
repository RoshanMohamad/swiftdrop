import { Router, type Request, type Response, type NextFunction } from "express";
import { assistantChatInputSchema } from "@swiftdrop/contracts";
import type { AssistantService } from "./service.js";
import type { AuthService } from "../auth/service.js";
import { authenticate } from "../auth/index.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import type { Config } from "../../shared/config.js";

export function createAssistantRouter(
  assistant: AssistantService,
  auth: AuthService,
  _limiter: RateLimiter,
  _config: Config,
) {
  const router = Router();

  const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization?.startsWith("Bearer ")) {
      return authenticate(auth)(req, res, (err) => {
        // If expired or invalid token, proceed unauthenticated rather than rejecting chat
        if (err) {
          next();
        } else {
          next();
        }
      });
    }
    next();
  };

  router.post("/assistant/chat", optionalAuth, async (req, res, next) => {
    try {
      const userId = res.locals.user?.id;
      const input = assistantChatInputSchema.parse(req.body);
      const response = await assistant.chat(userId, input);
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
