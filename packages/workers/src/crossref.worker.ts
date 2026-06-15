// ==============================================================
// CROSSREF WORKER — Validación de citas bibliográficas
// Rate Limiting: 1 req/seg (polite pool)
// ==============================================================

import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { QUEUES, RATE_LIMITS, GEMINI_PROMPTS } from '@revisor-tesis/shared';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ExtractedCitation {
  rawText: string;
  title?: string;
  authors?: string;
  year?: string;
  doi?: string;
}

function cleanAndParseJSON(rawJson: string): any {
  // Sanitización de Cadenas LLM para evitar Bad control character in string literal
  const sanitized = rawJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  try {
    return JSON.parse(sanitized);
  } catch (err: any) {
    // Reintentar reemplazando comillas tipográficas
    try {
      const moreSanitized = sanitized
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      return JSON.parse(moreSanitized);
    } catch (innerErr: any) {
      throw new Error(`${innerErr.message}. JSON resultante: ${sanitized.substring(0, 300)}...`);
    }
  }
}

export function startCrossrefWorker(prisma: PrismaClient, connection: IORedis) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const mailto = process.env.CROSSREF_MAILTO || 'test@universidad.edu.pe';

  const worker = new Worker(
    QUEUES.CROSSREF,
    async (job) => {
      const { submissionId, documentText } = job.data;
      console.log(`📚 [CrossRef] Validando citas del documento ${submissionId}`);

      await prisma.aiReviewJob.create({
        data: { submissionId, jobType: 'crossref', status: 'PROCESSING', startedAt: new Date() },
      });

      try {
        const refSection = documentText.substring(documentText.length - 8000);
        const prompt = GEMINI_PROMPTS.EXTRACT_CITATIONS(refSection);

        // 1. Extraer citas usando Gemini con resiliencia de modelos
        let result: any;
        let lastErr: any;
        const modelsToTry = [
          process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-3.1-flash-lite',
          'gemini-flash-latest',
          'gemini-flash-lite-latest'
        ];
        const uniqueModels = Array.from(new Set(modelsToTry));

        for (const mName of uniqueModels) {
          let retries = 3;
          let delay = 10000;
          while (retries > 0) {
            try {
              console.log(`   🤖 [CrossRef] Intentando extraer citas con modelo: ${mName} (Intentos restantes: ${retries})`);
              const model = genAI.getGenerativeModel({ model: mName });
              result = await model.generateContent(prompt);
              if (result) break;
            } catch (err: any) {
              lastErr = err;
              const errMsg = err.message || '';
              const isRetryable = errMsg.includes('429') || 
                                  errMsg.includes('Too Many Requests') || 
                                  errMsg.toLowerCase().includes('quota') ||
                                  errMsg.toLowerCase().includes('limit') ||
                                  errMsg.includes('RESOURCE_EXHAUSTED') ||
                                  errMsg.includes('503') ||
                                  errMsg.toLowerCase().includes('service unavailable') ||
                                  errMsg.toLowerCase().includes('high demand') ||
                                  errMsg.includes('500');

              if (isRetryable) {
                console.warn(`⚠️ [CrossRef Retryable] Modelo ${mName} reportó error temporal/cuota: ${errMsg}. Esperando ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries--;
                delay *= 2;
              } else {
                console.error(`Error no reintentable en CrossRef con modelo ${mName}: ${errMsg}`);
                break;
              }
            }
          }
          if (result) break;
        }

        if (!result) throw lastErr || new Error('Todos los modelos de extracción de citas fallaron');

        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('La respuesta de Gemini no contiene JSON válido para citas');
        
        let parsed: any;
        try {
          parsed = cleanAndParseJSON(jsonMatch[0]);
        } catch (parseError: any) {
          console.error(`❌ [CrossRef] Falló el parseo JSON de citas: ${parseError.message}`);
          throw new Error(`Error parseando respuesta de Gemini: ${parseError.message}`);
        }

        const citations: ExtractedCitation[] = parsed.citations || [];
        console.log(`   📖 ${citations.length} citas extraídas`);

        // 2. Validar cada cita contra CrossRef (1 req/seg)
        for (let i = 0; i < citations.length; i++) {
          const citation = citations[i];
          let status: 'VERIFIED' | 'PARTIAL' | 'NOT_FOUND' = 'NOT_FOUND';
          let crossrefData: any = {};
          let matchScore = 0;

          try {
            const query = encodeURIComponent(citation.title || citation.rawText.substring(0, 100));
            const url = `https://api.crossref.org/works?query=${query}&rows=3&mailto=${mailto}`;
            const response = await fetch(url);
            if (response.ok) {
              const data = await response.json() as any;
              const items = data.message?.items || [];
              if (items.length > 0) {
                const best = items[0];
                crossrefData = {
                  doi: best.DOI,
                  title: best.title?.[0],
                  year: best.published?.['date-parts']?.[0]?.[0]?.toString(),
                  authors: best.author?.map((a: any) => `${a.given || ''} ${a.family || ''}`).join(', '),
                };
                // Calcular match score
                const titleMatch = citation.title && crossrefData.title?.toLowerCase().includes(citation.title.toLowerCase().substring(0, 20));
                const yearMatch = citation.year === crossrefData.year;
                if (titleMatch && yearMatch) { status = 'VERIFIED'; matchScore = 0.95; }
                else if (titleMatch || yearMatch) { status = 'PARTIAL'; matchScore = 0.6; }
              }
            }
          } catch { /* Ignorar errores de red */ }

          await prisma.citationValidation.create({
            data: {
              submissionId, rawCitation: citation.rawText,
              extractedTitle: citation.title, extractedDoi: citation.doi,
              extractedYear: citation.year, extractedAuthors: citation.authors,
              crossrefDoi: crossrefData.doi, crossrefTitle: crossrefData.title,
              crossrefYear: crossrefData.year, crossrefAuthors: crossrefData.authors,
              status, matchScore,
            },
          });

          // Rate limit: esperar 1 segundo entre peticiones
          if (i < citations.length - 1) {
            await new Promise((r) => setTimeout(r, 1000 / RATE_LIMITS.CROSSREF_RPS));
          }
        }

        await prisma.aiReviewJob.updateMany({
          where: { submissionId, jobType: 'crossref' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        console.log(`✅ [CrossRef] Validación completada para ${citations.length} citas`);
        return { citationsValidated: citations.length };
      } catch (error: any) {
        await prisma.aiReviewJob.updateMany({
          where: { submissionId, jobType: 'crossref' },
          data: { status: 'FAILED', lastError: error.message, completedAt: new Date() },
        });
        throw error;
      }
    },
    { connection, concurrency: 1, limiter: { max: 1, duration: 1200 } },
  );

  worker.on('failed', (job, error) => {
    console.error(`❌ [CrossRef] Job ${job?.id} falló:`, error.message);
  });
  console.log('   ✅ CrossRef Worker iniciado (1 RPS polite pool)');
}
