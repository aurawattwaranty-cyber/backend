import type { IncomingMessage, ServerResponse } from "node:http";

export function createServerlessHandler(
  app: (req: IncomingMessage, res: ServerResponse) => void,
  ready: Promise<void>,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    await ready;

    const incomingUrl = req.url ?? "/";
    const parsedUrl = new URL(incomingUrl, "http://localhost");
    const routePath = parsedUrl.searchParams.get("path");
    if (routePath) {
      parsedUrl.searchParams.delete("path");
      const normalisedPath = routePath.startsWith("/")
        ? routePath
        : `/${routePath}`;
      const search = parsedUrl.searchParams.toString();
      req.url = `/api${normalisedPath}${search ? `?${search}` : ""}`;
    } else if (parsedUrl.pathname === "/api/index") {
      const search = parsedUrl.searchParams.toString();
      req.url = `/api${search ? `?${search}` : ""}`;
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        res.off("finish", onDone);
        res.off("close", onDone);
      };
      const onDone = () => {
        cleanup();
        resolve();
      };

      res.once("finish", onDone);
      res.once("close", onDone);

      try {
        app(req, res);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  };
}
