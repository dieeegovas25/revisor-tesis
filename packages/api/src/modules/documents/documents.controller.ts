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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('documents')
@UseGuards(AuthGuard('jwt'))
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.documentsService.findAll(user.id, user.role, page, limit);
    return { success: true, ...result };
  }

  @Post('upload/:projectId')
  @UseGuards(RolesGuard)
  @Roles('STUDENT', 'ADVISOR', 'COORDINATOR', 'ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              `Tipo de archivo no permitido: ${file.mimetype}. Permitidos: PDF, DOCX, DOC`,
            ),
            false,
          );
        }
      },
    }),
  )
  async upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No se ha proporcionado ningún archivo o el formato no es válido.');
      }
      const submission = await this.documentsService.uploadDocument(projectId, file);
      return {
        success: true,
        data: submission,
        message: 'Documento subido exitosamente. El análisis IA se ha encolado.',
      };
    } catch (error: any) {
      const filename = file ? file.originalname : 'Archivo desconocido';
      throw new BadRequestException({
        success: false,
        message: `Error al procesar el archivo "${filename}": ${error.message}`,
        error: 'Bad Request',
        statusCode: 400,
        failedFile: filename,
      });
    }
  }

  @Get('project/:projectId')
  async findByProject(
    @Param('projectId') projectId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.documentsService.findByProject(projectId, page, limit);
    return { success: true, ...result };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const document = await this.documentsService.findById(id);
    return { success: true, data: document };
  }

  @Get(':id/download')
  async getDownloadUrl(@Param('id') id: string) {
    const url = await this.documentsService.getDownloadUrl(id);
    return { success: true, data: { url } };
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('ADVISOR', 'COORDINATOR', 'ADMIN')
  async approveReject(
    @Param('id') id: string,
    @CurrentUser('id') advisorId: string,
    @Body() body: { approved: boolean; comment?: string },
  ) {
    const result = await this.documentsService.approveReject(
      id,
      advisorId,
      body.approved,
      body.comment,
    );
    return { success: true, data: result };
  }
}
