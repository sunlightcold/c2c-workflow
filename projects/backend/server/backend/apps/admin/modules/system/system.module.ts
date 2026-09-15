/* eslint-disable no-use-before-define */
import { Module } from '@nestjs/common'

import { RouterModule } from '@nestjs/core'
import { MenuModule } from './menu'
import { OnlineModule } from './online'
import { ParamsModule } from './params'
import { RoleModule } from './role'
import { TaskModule } from './task'
import { UserModule } from './user'
import { LogModule } from './log'
import { StorageModule } from './storage'
import { TutorialAdminModule } from './tutorial/tutorial-admin.module'
import { CredentialModule } from './credential'
import { BusinessModule } from '../business'
import { C2cPlatformModule } from '../c2c-platform'
import { PaymentModule } from '../payment'
import { C2cOrderModule } from '../c2c-order'
import { TelegramModule } from '../telegram'
import { DashboardModule } from '../dashboard'

const routedModules = [
  CredentialModule,
  MenuModule,
  RoleModule,
  UserModule,
  OnlineModule,
  LogModule,
  TaskModule,
  ParamsModule,
  StorageModule,
  TutorialAdminModule,
  BusinessModule,
  C2cPlatformModule,
  PaymentModule,
  C2cOrderModule,
  DashboardModule,
]
const modules = [...routedModules, TelegramModule]

@Module({
  imports: [
    ...modules,
    RouterModule.register([
      {
        path: 'sys',
        module: SystemModule,
        children: [...routedModules, { path: 'tg', module: TelegramModule }],
      },
    ]),
  ],
  exports: [...modules],
})
export class SystemModule {}
