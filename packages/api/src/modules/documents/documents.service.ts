import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../storage/minio.service';
import { QUEUES, FILE_CONFIG } from '@revisor-tesis/shared';
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    @InjectQueue(QUEUES.EMBEDDINGS) private embeddingsQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATIONS) private notificationsQueue: Queue,
  ) {}

  async uploadDocument(
    projectId: string,
    file: Express.Multer.File,
  ) {
    // 1. Validaciones iniciales
    if (!file) {
      throw new BadRequestException('Archivo no provisto.');
    }

    if (!FILE_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido. Permitidos: ${FILE_CONFIG.ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    if (file.size > FILE_CONFIG.MAX_FILE_SIZE) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 50MB');
    }

    const project = await this.prisma.thesisProject.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    // 2. Subir a MinIO
    let fileKey: string;
    try {
      fileKey = await this.minio.uploadDocument(
        file.originalname,
        file.buffer,
        file.mimetype,
      );
    } catch (error: any) {
      throw new BadRequestException(`Fallo en el servicio de almacenamiento (MinIO): ${error.message}`);
    }

    // 3. Crear registro en base de datos
    let submission;
    try {
      submission = await this.prisma.documentSubmission.create({
        data: {
          projectId,
          fileName: file.originalname,
          fileKey,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'EXTRACTING',
        },
      });
    } catch (error: any) {
      throw new BadRequestException(`Fallo al registrar la entrega en base de datos: ${error.message}`);
    }

    // 4. Extraer texto y encolar
    try {
      const extractedText = await this.extractText(file.buffer, file.mimetype);

      await this.prisma.documentSubmission.update({
        where: { id: submission.id },
        data: {
          extractedText,
          status: 'VECTORIZING',
        },
      });

      // Crear job de revisión IA
      await this.prisma.aiReviewJob.create({
        data: {
          submissionId: submission.id,
          jobType: 'embeddings',
          status: 'PENDING',
        },
      });

      // Encolar procesamiento de embeddings
      await this.embeddingsQueue.add(
        'process-embeddings',
        {
          submissionId: submission.id,
          projectId,
          text: extractedText,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    } catch (error: any) {
      try {
        await this.prisma.documentSubmission.update({
          where: { id: submission.id },
          data: { status: 'ERROR' },
        });
      } catch (dbError) {
        console.error('No se pudo actualizar el estado de la entrega a ERROR:', dbError);
      }
      throw new BadRequestException(`Error extrayendo texto: ${error.message}`);
    }

    return submission;
  }

  async findAll(userId: string, userRole: string, page = 1, limit = 20) {
    const where: any = {};
    if (userRole === 'STUDENT') {
      where.project = { studentId: userId };
    } else if (userRole === 'ADVISOR') {
      where.project = { advisorId: userId };
    } else if (userRole === 'COORDINATOR') {
      where.project = { coordinatorId: userId };
    }

    const [submissions, total] = await Promise.all([
      this.prisma.documentSubmission.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              findings: true,
              plagiarismAlerts: true,
              citationValidations: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.documentSubmission.count({ where }),
    ]);

    return {
      data: submissions.map((s) => ({
        ...s,
        findingsCount: s._count.findings,
        plagiarismAlertsCount: s._count.plagiarismAlerts,
        citationsCount: s._count.citationValidations,
        _count: undefined,
        extractedText: undefined,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByProject(projectId: string, page = 1, limit = 20) {
    const [submissions, total] = await Promise.all([
      this.prisma.documentSubmission.findMany({
        where: { projectId },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              findings: true,
              plagiarismAlerts: true,
              citationValidations: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.documentSubmission.count({ where: { projectId } }),
    ]);

    return {
      data: submissions.map((s) => ({
        ...s,
        findingsCount: s._count.findings,
        plagiarismAlertsCount: s._count.plagiarismAlerts,
        citationsCount: s._count.citationValidations,
        _count: undefined,
        extractedText: undefined, // No enviar texto completo en listados
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const submission = await this.prisma.documentSubmission.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, title: true, studentId: true, advisorId: true },
        },
        findings: { orderBy: { severity: 'asc' } },
        plagiarismAlerts: { orderBy: { similarityScore: 'desc' } },
        citationValidations: true,
        aiReviewJobs: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!submission) throw new NotFoundException('Documento no encontrado');
    return submission;
  }

  async approveReject(
    submissionId: string,
    advisorId: string,
    approved: boolean,
    comment?: string,
  ) {
    const submission = await this.prisma.documentSubmission.update({
      where: { id: submissionId },
      data: {
        advisorApproved: approved,
        advisorComment: comment,
        reviewedAt: new Date(),
      },
      include: { project: true },
    });

    // Notificar al estudiante
    await this.notificationsQueue.add('send-notification', {
      userId: submission.project.studentId,
      type: approved ? 'ADVISOR_APPROVED' : 'ADVISOR_REJECTED',
      projectTitle: submission.project.title,
      advisorId,
    });

    return submission;
  }

  async getDownloadUrl(id: string) {
    const submission = await this.prisma.documentSubmission.findUnique({
      where: { id },
      select: { fileKey: true },
    });
    if (!submission) throw new NotFoundException('Documento no encontrado');
    return this.minio.getPresignedUrl(submission.fileKey);
  }

  // ─── Extracción de texto ──────────────────────────────────

  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const data = await pdfParse(buffer);
        if (!data || typeof data.text !== 'string') {
          throw new Error('El archivo PDF no contiene texto legible.');
        }
        return data.text;
      }

      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        const result = await mammoth.extractRawText({ buffer });
        if (!result || typeof result.value !== 'string') {
          throw new Error('El documento Word no contiene texto legible.');
        }
        return result.value;
      }

      throw new BadRequestException('Tipo de archivo no soportado para extracción de texto');
    } catch (error: any) {
      throw new Error(`Fallo en lectura de formato: ${error.message}`);
    }
  }
}
