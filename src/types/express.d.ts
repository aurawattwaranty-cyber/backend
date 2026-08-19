import type { AdminUser } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AdminUser;
      sessionToken?: string;
    }
  }
}

export {};
