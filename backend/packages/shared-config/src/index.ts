/** Central env schema / config validation — wire @nestjs/config in each app. */
export function serviceName(): string {
  return process.env.SERVICE_NAME ?? "unknown";
}
