import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { GeneratorController } from './generator.controller';
import { GeneratorProcessor } from './generator.processor';
import { GeminiService, CrossRefService } from './generator.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'generator',
    }),
  ],
  controllers: [GeneratorController],
  providers: [
    GeneratorProcessor,
    GeminiService,
    CrossRefService,
  ],
  exports: [
    GeminiService,
    CrossRefService,
  ],
})
export class GeneratorModule {}
