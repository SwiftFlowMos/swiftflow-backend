import { Controller, Get } from '@nestjs/common';
@Controller()
export class HealthController {
  @Get('health')
  health() { return { status: 'ok', app: 'SwiftFlow API', version: '1.0.0' }; }
}
