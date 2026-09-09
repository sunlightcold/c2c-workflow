import { Module, Provider } from '@nestjs/common'
import { AuthModule } from '../system/auth'
import { OnlineModule } from '../system'
import { WebEventsGateway } from './events'

const providers: Provider[] = [WebEventsGateway]

@Module({
  imports: [AuthModule, OnlineModule],
  providers,
  exports: [...providers],
})
export class SocketModule {}
