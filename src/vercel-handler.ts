import type { IncomingMessage, ServerResponse } from "node:http";

export function createServerlessHandler(
  app: (req: IncomingMessage, res: ServerResponse) => void,
  ready: Promise<void>,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    await ready;

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
