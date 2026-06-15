import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

@Injectable()
export class ChatbotService {
  private genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.logger.log('ChatbotService inicializado');
  }

  /**
   * Obtiene la cantidad total de tesis revisadas en tiempo real.
   */
  async obtenerCantidadTesisRevisadas() {
    try {
      const tesisRevisadas = await this.prisma.documentSubmission.count({
        where: { status: 'REVIEWED' },
      });
      const totalBorradoresTesis = await this.prisma.thesis.count();

      return {
        success: true,
        tesisRevisadas,
        totalBorradoresTesis,
      };
    } catch (error: any) {
      this.logger.error(`Error en obtenerCantidadTesisRevisadas: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene las estadísticas de los hallazgos agrupados por severidad.
   */
  async obtenerEstadisticasHallazgos() {
    try {
      const rawStats = await this.prisma.aiReviewFinding.groupBy({
        by: ['severity'],
        _count: {
          id: true,
        },
      });

      const stats: Record<string, number> = {
        CRITICAL: 0,
        MAJOR: 0,
        MINOR: 0,
        INFO: 0,
      };

      for (const item of rawStats) {
        if (item.severity in stats) {
          stats[item.severity] = item._count.id;
        }
      }

      const total = Object.values(stats).reduce((acc, curr) => acc + curr, 0);

      return {
        success: true,
        estadisticas: stats,
        totalHallazgos: total,
      };
    } catch (error: any) {
      this.logger.error(`Error en obtenerEstadisticasHallazgos: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async query(message: string): Promise<string> {
    const primary = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    const models = Array.from(new Set([primary, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-pro-latest']));
    const systemInstruction =
      'Actúas como el asistente inteligente oficial de la plataforma Revisor de Tesis de la Universidad Nacional de Trujillo (UNT). Tu objetivo es ayudar a estudiantes y asesores a conocer el estado de sus proyectos, absolver dudas del sistema y dar estadísticas de la base de datos en tiempo real. Sé sumamente cortés, directo y preciso.';

    let currentModelIndex = 0;
    while (currentModelIndex < models.length) {
      const modelName = models[currentModelIndex];
      this.logger.log(`[Chatbot Gemini] Intentando consulta con modelo: ${modelName}`);

      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemInstruction }],
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'obtenerCantidadTesisRevisadas',
                  description:
                    'Obtiene la cantidad exacta de tesis revisadas en la plataforma (submissions con estado REVIEWED) y la cantidad de tesis creadas en el borrador en tiempo real.',
                  parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: 'obtenerEstadisticasHallazgos',
                  description:
                    'Obtiene las estadísticas y recuento de todos los hallazgos de revisión (findings) por severidad (CRITICAL, MAJOR, MINOR, INFO) en tiempo real.',
                  parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                  },
                },
              ],
            },
          ],
        });

        const chat = model.startChat();
        const result = await chat.sendMessage(message);

        const calls = result.response.functionCalls();
        if (calls && calls.length > 0) {
          const call = calls[0];
          this.logger.log(`Gemini solicitó llamar a: ${call.name}`);

          let functionResponse: any;

          if (call.name === 'obtenerCantidadTesisRevisadas') {
            functionResponse = await this.obtenerCantidadTesisRevisadas();
          } else if (call.name === 'obtenerEstadisticasHallazgos') {
            functionResponse = await this.obtenerEstadisticasHallazgos();
          } else {
            functionResponse = { success: false, error: 'Función no encontrada' };
          }

          this.logger.log(`Enviando respuesta de la función a Gemini: ${JSON.stringify(functionResponse)}`);

          const finalResult = await chat.sendMessage([
            {
              functionResponse: {
                name: call.name,
                response: functionResponse,
              },
            },
          ]);

          return finalResult.response.text();
        }

        return result.response.text();
      } catch (error: any) {
        this.logger.warn(`⚠️ Error en modelo ${modelName}: ${error.message || error}`);
        currentModelIndex++;
        if (currentModelIndex < models.length) {
          this.logger.log(`Probando con modelo de respaldo: ${models[currentModelIndex]}`);
          continue;
        } else {
          this.logger.error(`❌ Todos los modelos de Gemini fallaron al procesar la consulta: ${error.message || error}`);
          break;
        }
      }
    }
    return 'Disculpa, ocurrió un error temporal al procesar tu solicitud. Por favor, inténtalo de nuevo en unos momentos.';
  }
}
