import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/",
})
export class MeetingGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage("ping")
  handlePing(): { event: string; data: Record<string, unknown> } {
    return { event: "pong", data: {} };
  }
}
