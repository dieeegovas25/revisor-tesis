import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerateThesisDto } from './generator.dto';

@Controller('generator')
@UseGuards(AuthGuard('jwt'))
export class GeneratorController {
  private readonly logger = new Logger(GeneratorController.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('generator') private readonly generatorQueue: Queue,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(@Body() dto: GenerateThesisDto) {
    const productLabel = dto.productType === 'ARTICLE' ? 'Artículo Científico' : 'Proyecto de Tesis';
    this.logger.log(`Iniciando solicitud de generación de ${productLabel} para: "${dto.title}"`);

    // 1. Crear el borrador de tesis en la base de datos con estado PENDING
    const thesis = await this.prisma.thesis.create({
      data: {
        title: dto.title,
        lineOfResearch: dto.lineOfResearch,
        campus: dto.campus,
        authorName: dto.authorName,
        advisorName: dto.advisorName,
        productType: dto.productType,
        status: 'PENDING',
      },
    });

    this.logger.log(`${productLabel} registrado en BD con ID: ${thesis.id} en estado PENDING`);

    // 2. Encolar el trabajo en BullMQ usando el thesis.id como el jobId de BullMQ
    const job = await this.generatorQueue.add(
      'generate-thesis-structure',
      {
        thesisId: thesis.id,
        dto,
      },
      {
        jobId: thesis.id, // Mapeo crítico para obtener progreso usando el ID de la tesis
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // Si falla, espera 60 segundos antes del primer reintento (evita el bloqueo del 429)
        },
      },
    );

    this.logger.log(`Trabajo de generación encolado. Job ID: ${job.id}`);

    // 3. Retornar mensaje de éxito con el ID para monitoreo
    return {
      success: true,
      message: `${productLabel} encolado correctamente para su generación automática en segundo plano.`,
      thesisId: thesis.id,
      status: thesis.status,
    };
  }

  @Get(':id')
  async getStatus(@Param('id') id: string) {
    // 1. Obtener la tesis de la base de datos
    const thesis = await this.prisma.thesis.findUnique({
      where: { id },
    });

    if (!thesis) {
      throw new NotFoundException('Documento no encontrado.');
    }

    const productLabel = thesis.productType === 'ARTICLE' ? 'Artículo Científico' : 'Proyecto de Tesis';
    this.logger.log(`Consultando estado de ${productLabel}: ${id}`);

    // 2. Obtener el progreso del trabajo de BullMQ
    let progress = 0;
    try {
      const job = await this.generatorQueue.getJob(id);
      if (job) {
        progress = typeof job.progress === 'number' ? job.progress : 0;
      } else if (thesis.status === 'COMPLETED') {
        progress = 100;
      }
    } catch (err: any) {
      this.logger.error(`Error al obtener progreso de BullMQ para ${productLabel} ${id}: ${err.message}`);
    }

    return {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      progress,
      productType: thesis.productType,
      structuredContent: thesis.structuredContent ? JSON.parse(thesis.structuredContent) : null,
      createdAt: thesis.createdAt,
    };
  }
}
