import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowService } from './workflow.service';

@ApiTags('Workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  @Get('steps')
  getSteps() { return this.workflowService.getAllSteps(); }

  @Patch('steps/:id')
  updateStep(@Param('id') id: string, @Body() data: any) {
    return this.workflowService.updateStep(id, data);
  }
}
