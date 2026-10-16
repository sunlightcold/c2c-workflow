import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { SkipResponseInterceptor } from '@/common/interceptors/response.interceptor'
import { SkipLog } from '@admin/interceptors/skip-log.decorator'
import { ChatAccessService } from './chat-access.service'
import { ChatImageLimitInterceptor } from './chat-image.service'
import { CHAT_MAX_IMAGE_BYTES } from './chat.types'
import {
  ChatWindowDto,
  ChatLiveDto,
  ChatReplyDto,
  ChatOrderQueryDto,
  ChatOpenConversationDto,
} from './merchant-chat.dto'
import { MerchantChatService } from './merchant-chat.service'

const P = definePermission('merchant:chat', ['read', 'reply'] as const)
@ApiTags('C2C-后台实时聊天')
@ApiBearerAuth()
@SkipLog()
@Controller('merchant-chats/live')
export class MerchantChatController {
  constructor(
    private readonly chat: MerchantChatService,
    private readonly access: ChatAccessService,
  ) {}
  @Get()
  @Permission(P.READ)
  @ApiOperation({ summary: '当前聊天窗口快照' })
  async live(@Query() dto: ChatLiveDto, @User() actor: AuthUser) {
    return this.chat.snapshot(await this.access.authorize(actor, dto.tenantId), dto.merchantId)
  }
  @Get('orders')
  @Permission(P.READ)
  @ApiOperation({ summary: '筛选可创建聊天会话的商家订单' })
  async orders(@Query() dto: ChatOrderQueryDto, @User() actor: AuthUser) {
    return this.chat.listOrders(await this.access.authorize(actor, dto.tenantId), dto)
  }
  @Post('conversations')
  @Permission(P.READ)
  @ApiOperation({ summary: '按商家订单创建或打开当前聊天会话' })
  async open(@Body() dto: ChatOpenConversationDto, @User() actor: AuthUser) {
    const tenantId = await this.access.authorize(actor, dto.tenantId)
    return this.chat.openConversation({ tenantId, merchantId: dto.merchantId }, dto.merchantOrderId)
  }
  @Delete('conversations/:conversationId')
  @Permission([P.READ, P.REPLY])
  @ApiOperation({ summary: '删除当前后台窗口中的聊天会话' })
  async remove(
    @Query() dto: ChatWindowDto,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @User() actor: AuthUser,
  ) {
    const tenantId = await this.access.authorize(actor, dto.tenantId, true)
    return this.chat.deleteConversation(
      { tenantId, merchantId: dto.merchantId },
      dto.instanceId,
      conversationId,
    )
  }
  @Post('reply')
  @Permission([P.READ, P.REPLY])
  @ApiOperation({ summary: '后台发送文字或图片' })
  @UseInterceptors(
    ChatImageLimitInterceptor,
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: CHAT_MAX_IMAGE_BYTES, files: 1, fields: 7, fieldSize: 16_384, parts: 8 },
    }),
  )
  async reply(
    @Body() dto: ChatReplyDto,
    @User() actor: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const tenantId = await this.access.authorize(actor, dto.tenantId, true)
    return this.chat.reply({ tenantId, merchantId: dto.merchantId }, dto, actor.uid, file)
  }
  @Get('messages/:messageId/attachments/:attachmentId')
  @Permission(P.READ)
  @ApiOperation({ summary: '读取当前窗口内的受保护图片' })
  @SkipResponseInterceptor()
  @UseInterceptors(ChatImageLimitInterceptor)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async attachment(
    @Query() dto: ChatWindowDto,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @User() actor: AuthUser,
  ) {
    const tenantId = await this.access.authorize(actor, dto.tenantId)
    const image = await this.chat.attachment(
      { tenantId, merchantId: dto.merchantId },
      dto.instanceId,
      messageId,
      attachmentId,
    )
    await this.access.authorize(actor, dto.tenantId)
    return new StreamableFile(image.content, {
      type: image.mime,
      length: image.content.length,
      disposition: 'inline',
    })
  }
}
