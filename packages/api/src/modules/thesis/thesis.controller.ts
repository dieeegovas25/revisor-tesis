import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThesisService } from './thesis.service';
import { DocumentsService } from '../documents/documents.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('thesis')
@UseGuards(AuthGuard('jwt'))
export class ThesisController {
  constructor(
    private thesisService: ThesisService,
    private documentsService: DocumentsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('STUDENT', 'ADVISOR', 'ADMIN', 'COORDINATOR')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      if (file) {
        // Generar título del proyecto a partir del nombre del archivo sin extensión
        const originalName = file.originalname;
        const dotIndex = originalName.lastIndexOf('.');
        const title = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;

        // Crear el proyecto
        const project = await this.thesisService.create(user.id, {
          title,
          description: `Proyecto de tesis creado automáticamente por lote desde el archivo: ${originalName}`,
          researchLine: body?.researchLine || 'Línea de investigación general',
          advisorId: body?.advisorId,
          patternId: body?.patternId,
          nextDeadline: body?.nextDeadline,
        });

        // Subir documento para el proyecto creado
        const submission = await this.documentsService.uploadDocument(project.id, file);

        return {
          success: true,
          data: {
            project,
            submission,
          },
          message: 'Proyecto creado y documento subido exitosamente.',
        };
      } else {
        // Flujo tradicional (JSON)
        const project = await this.thesisService.create(user.id, body);
        return { success: true, data: project };
      }
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        message: `Error al procesar la creación/subida del archivo: ${error.message}`,
        error: 'Bad Request',
        statusCode: 400,
      });
    }
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.thesisService.findAll(user.id, user.role, page, limit);
    return { success: true, ...result };
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    const project = await this.thesisService.findById(id, user.id, user.role);
    return { success: true, data: project };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const project = await this.thesisService.update(id, user.id, user.role, body);
    return { success: true, data: project };
  }
}
