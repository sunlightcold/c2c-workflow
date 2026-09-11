import { Public } from '@/common/decorators'
import { Body, Controller, Headers, Param, Post } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { TelegramUpdateInboxService } from './telegram-update-inbox.service'

@ApiTags('C2C-Telegram Webhook')
@Controller('webhooks')
export class TelegramWebhookController {
  constructor(private readonly inbox: TelegramUpdateInboxService) {}

  @Post(':botCode')
  @Public()
  @ApiOperation({ summary: '接收 Telegram Update；相同机器人和 Update ID 只接收一次' })
  @ApiParam({ name: 'botCode', description: '机器人编码', type: String })
  @ApiHeader({ name: 'x-telegram-bot-api-secret-token', required: true })
  receive(
    @Param('botCode') botCode: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.inbox.receive(botCode.trim().toUpperCase(), secret, payload)
  }
}
