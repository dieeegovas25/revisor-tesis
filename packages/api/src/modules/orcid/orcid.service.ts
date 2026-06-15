import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service'; // Ruta actualizada
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class OrcidService {
    private genAI: GoogleGenerativeAI;

    constructor(private prisma: PrismaService) {
        // Instanciamos Gemini con tu API Key del archivo .env
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    }

    async verifyAdvisorExpertise(userId: string, orcidId: string, thesisTopic: string) {
        try {
            // 1. Extraer datos limpios de la API pública de ORCID
            const response = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/works`, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) throw new Error('No se encontró el perfil ORCID o es privado');

            const data: any = await response.json();

            // Extraemos solo los títulos de las publicaciones
            const publications = data.group?.map((g: any) => g['work-summary'][0]?.title?.title?.value) || [];

            if (publications.length === 0) {
                throw new HttpException('El perfil ORCID no tiene publicaciones públicas para evaluar.', HttpStatus.BAD_REQUEST);
            }

            // 2. Preguntarle a Gemini (IA Evaluadora) con resiliencia de modelos
            let aiResult: any;
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

            const prompt = `
        Actúa como un comité académico universitario muy estricto.
        Tema de tesis a supervisar: "${thesisTopic}"
        
        Historial de publicaciones del candidato a asesor:
        ${publications.map((p: string) => `- ${p}`).join('\n')}
        
        ¿Tiene este asesor experiencia demostrable en sus publicaciones para supervisar esta tesis?
        Responde estrictamente en formato JSON con esta estructura:
        {
          "isSuitable": boolean,
          "justification": "justificación breve del veredicto"
        }
      `;

            for (const mName of uniqueModels) {
              let retries = 3;
              let delay = 10000;
              while (retries > 0) {
                try {
                  const model = this.genAI.getGenerativeModel({ model: mName });
                  aiResult = await model.generateContent(prompt);
                  if (aiResult) break;
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
                    console.warn(`⚠️ [ORCID Retryable] Modelo ${mName} reportó error temporal/cuota: ${errMsg}. Esperando ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries--;
                    delay *= 2;
                  } else {
                    console.error(`Error no reintentable en ORCID con modelo ${mName}: ${errMsg}`);
                    break;
                  }
                }
              }
              if (aiResult) break;
            }

            if (!aiResult) throw lastErr || new Error('Todos los modelos de evaluación ORCID fallaron');

            const textResponse = aiResult.response.text().replace(/```json/g, '').replace(/```/g, '');
            const evaluation = JSON.parse(textResponse);

            // 3. Guardar el veredicto en tu base de datos (Prisma)
            const profile = await this.prisma.orcidProfile.upsert({
                where: { userId: userId },
                update: {
                    orcidId: orcidId,
                    works: JSON.stringify(publications),
                    isVerified: evaluation.isSuitable,
                    aiJustification: evaluation.justification,
                    lastSyncAt: new Date()
                },
                create: {
                    userId: userId,
                    orcidId: orcidId,
                    works: JSON.stringify(publications),
                    isVerified: evaluation.isSuitable,
                    aiJustification: evaluation.justification,
                    lastSyncAt: new Date()
                }
            });

            return {
                success: true,
                isVerified: profile.isVerified,
                justification: profile.aiJustification,
                totalPublications: publications.length
            };

        } catch (error: any) {
            console.error('Error en verificación ORCID:', error);
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}