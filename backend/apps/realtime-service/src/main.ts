import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * Socket.io + Express HTTP for WebSockets (NestJS default pairing).
 * Add Fastify HTTP + Redis IoAdapter in Phase 2 per RFC §9.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 3007;
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
