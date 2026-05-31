// ==============================================================
// GEMINI WORKER
// Análisis de tesis con Gemini API (free tier)
// Rate Limiting: 12 RPM con backoff exponencial
// ==============================================================

import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import IORedis from 'ioredis';
import { QUEUES, GEMINI_PROMPTS, RATE_LIMITS } from '@revisor-tesis/shared';

// Helper de logueo descriptivo compatible con la firma de NestJS Logger
const Logger = {
  error: (message: string, error?: any) => {
    console.error(`[NestJS-Style] [ERROR] ❌ [Gemini Worker] ${message}`, error ? error : '');
  },
  warn: (message: string) => {
    console.warn(`[NestJS-Style] [WARN] ⚠️ [Gemini Worker] ${message}`);
  },
  log: (message: string) => {
    console.log(`[NestJS-Style] [INFO] 🤖 [Gemini Worker] ${message}`);
  }
};

export function startGeminiWorker(prisma: PrismaClient, connection: IORedis) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const worker = new Worker(
    QUEUES.GEMINI_REVIEW,
    async (job) => {
      const { submissionId, projectId } = job.data;
      Logger.log(`Analizando documento ${submissionId} (Intento: ${job.attemptsMade + 1}/${job.opts.attempts || 1})`);

      // Actualizar estado
      await prisma.aiReviewJob.updateMany({
        where: { submissionId, jobType: 'gemini' },
        data: { status: 'PROCESSING', startedAt: new Date() },
      });

      try {
        // 1. Obtener texto del documento
        const submission = await prisma.documentSubmission.findUnique({
          where: { id: submissionId },
          include: {
            project: {
              include: { pattern: true },
            },
          },
        });

        if (!submission || !submission.extractedText) {
          throw new Error('Documento o texto no encontrado');
        }

        // 2. Obtener estructura del patrón
        let patternStructure = 'No hay patrón asignado. Evalúa según estándares académicos generales.';

        if (submission.project?.pattern?.structure) {
          // Si el proyecto ya tiene un patrón explícitamente enlazado
          patternStructure = submission.project.pattern.structure;
          Logger.log(`Usando patrón del proyecto: ${submission.project.pattern.name}`);
        } else {
          // BÚSQUEDA GLOBAL: Si no tiene, agarramos la Rúbrica oficial
          try {
            const defaultPattern = await prisma.documentPattern.findFirst({
              where: { isDefault: true },
              orderBy: { createdAt: 'desc' }
            });

            if (defaultPattern && defaultPattern.structure) {
              patternStructure = defaultPattern.structure;
              Logger.log(`Usando patrón global por defecto: ${defaultPattern.name}`);
            } else {
              Logger.warn("No se encontró ningún patrón configurado como predeterminado en la base de datos.");
            }
          } catch (e: any) {
            Logger.warn(`No se pudo obtener el patrón por defecto de la base de datos: ${e.message}`);
          }
        }

        // 3. Truncar texto si es muy largo (Gemini tiene límite de tokens)
        const maxChars = 30000; // ~7500 tokens aprox
        const documentText = submission.extractedText.length > maxChars
          ? submission.extractedText.substring(0, maxChars) + '\n\n[... documento truncado por límite de tokens ...]'
          : submission.extractedText;

        // 4. Construir prompt y llamar a Gemini
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = GEMINI_PROMPTS.REVIEW_PROMPT(patternStructure, documentText);

        const result = await model.generateContent([
          { text: GEMINI_PROMPTS.SYSTEM_ROLE },
          { text: prompt },
        ]);

        const responseText = result.response.text();

        // 5. Parsear respuesta JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('La respuesta de Gemini no contiene JSON válido');
        }

        const review = JSON.parse(jsonMatch[0]);

        // 6. Guardar hallazgos en MySQL
        if (review.findings && Array.isArray(review.findings)) {
          for (const finding of review.findings) {
            await prisma.aiReviewFinding.create({
              data: {
                submissionId,
                category: finding.category || 'CONTENT',
                severity: finding.severity || 'MINOR',
                title: finding.title || 'Observación',
                description: finding.description || '',
                instruction: finding.instruction || '',
                affectedSection: finding.affectedSection,
                suggestedScore: finding.suggestedScore,
              },
            });
          }
        }

        // 7. Actualizar nota general
        await prisma.documentSubmission.update({
          where: { id: submissionId },
          data: {
            overallScore: review.overallScore || null,
            status: 'REVIEWED',
          },
        });

        await prisma.aiReviewJob.updateMany({
          where: { submissionId, jobType: 'gemini' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });

        Logger.log(`Análisis completado: ${review.findings?.length || 0} hallazgos, nota: ${review.overallScore}`);

        // 8. Encolar extracción de citas y notificación
        const crossrefQueue = new Queue(QUEUES.CROSSREF, { connection });
        const notifQueue = new Queue(QUEUES.NOTIFICATIONS, { connection });

        // Extraer citas usando Gemini
        await crossrefQueue.add('extract-and-validate-citations', {
          submissionId,
          projectId,
          documentText: submission.extractedText,
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 15000 },
        });

        // Notificar al estudiante
        await notifQueue.add('send-notification', {
          userId: submission.project.studentId,
          type: 'AI_REVIEW_COMPLETE',
          projectTitle: submission.project.title,
          submissionId,
        });

        return { findings: review.findings?.length || 0, score: review.overallScore };

      } catch (error: any) {
        const isQuotaError = error.message?.includes('429') || 
                             error.message?.includes('RESOURCE_EXHAUSTED') ||
                             error.message?.toLowerCase().includes('quota exceeded') ||
                             error.message?.toLowerCase().includes('too many requests');

        if (isQuotaError) {
          Logger.warn(`Límite de cuota / Rate limit (429) detectado en Gemini para el documento ${submissionId}. Se reintentará con backoff exponencial. Detalles: ${error.message}`);
          await prisma.aiReviewJob.updateMany({
            where: { submissionId, jobType: 'gemini' },
            data: { status: 'RATE_LIMITED', lastError: error.message },
          });
        } else {
          Logger.error(`Error de ejecución en Gemini para el documento ${submissionId}. Mensaje: ${error.message}`, error);
          await prisma.aiReviewJob.updateMany({
            where: { submissionId, jobType: 'gemini' },
            data: {
              status: 'FAILED',
              lastError: error.message,
              completedAt: new Date(),
            },
          });
        }

        // Si es el último intento fallido de BullMQ, forzamos estado ERROR en el documento
        const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 1);
        if (isFinalAttempt) {
          Logger.error(`Se han agotado todos los intentos de reintento (${job.opts.attempts || 1}) en BullMQ para el documento ${submissionId}. Marcando documento con estado terminal ERROR.`);
          await prisma.documentSubmission.update({
            where: { id: submissionId },
            data: { status: 'ERROR' },
          }).catch((dbErr: any) => Logger.error(`Fallo al actualizar el estado del documento a ERROR en BD: ${dbErr.message}`, dbErr));
        }

        throw error;
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: {
        max: RATE_LIMITS.GEMINI_RPM,  // 12 requests
        duration: 60_000,              // por minuto
      },
    },
  );

  worker.on('failed', async (job, error) => {
    Logger.error(`Job de análisis con Gemini ${job?.id} falló definitivamente: ${error.message}`, error);
    if (job) {
      const { submissionId } = job.data;
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 1);
      if (isFinalAttempt) {
        Logger.error(`[onFailed Handler] Reintentos agotados. Asegurando estado ERROR en BD para el documento ${submissionId}.`);
        
        await prisma.documentSubmission.update({
          where: { id: submissionId },
          data: { status: 'ERROR' },
        }).catch((dbErr: any) => Logger.error(`No se pudo actualizar el estado del documento a ERROR en el handler 'failed': ${dbErr.message}`, dbErr));

        await prisma.aiReviewJob.updateMany({
          where: { submissionId, jobType: 'gemini' },
          data: { status: 'FAILED', lastError: error.message, completedAt: new Date() },
        }).catch((dbErr: any) => Logger.error(`No se pudo actualizar el estado de aiReviewJob a FAILED en el handler 'failed': ${dbErr.message}`, dbErr));
      }
    }
  });

  Logger.log(`Gemini Worker iniciado (modelo: ${modelName}, límite: ${RATE_LIMITS.GEMINI_RPM} RPM)`);
}

