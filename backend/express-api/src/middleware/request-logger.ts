import { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on("finish", () => {
    const logEntry = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - startTime,
    };
    console.log(JSON.stringify(logEntry));
  });

  next();
}
