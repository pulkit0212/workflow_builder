import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { MeetingGateway } from "./realtime/meeting.gateway";

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [MeetingGateway],
})
export class AppModule {}
