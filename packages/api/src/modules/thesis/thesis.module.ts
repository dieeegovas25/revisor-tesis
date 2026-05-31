import { Module } from '@nestjs/common';
import { ThesisController } from './thesis.controller';
import { ThesisService } from './thesis.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [ThesisController],
  providers: [ThesisService],
  exports: [ThesisService],
})
export class ThesisModule {}
