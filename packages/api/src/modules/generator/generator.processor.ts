import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeminiService, CrossRefService } from './generator.service';
import { GenerateThesisDto } from './generator.dto';

@Processor('generator')
export class GeneratorProcessor extends WorkerHost {
  private readonly logger = new Logger(GeneratorProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly crossRefService: CrossRefService,
  ) {
    super();
  }

  /**
   * Helper simple para pausar la ejecución del hilo.
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Procesa los trabajos entrantes de la cola 'generator'.
   */
  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Procesando trabajo con ID: ${job.id}, Nombre: ${job.name}`);

    switch (job.name) {
      case 'generate-thesis-structure':
        return this.handleGenerateThesisStructure(job);
      default:
        throw new Error(`Nombre de trabajo desconocido: ${job.name}`);
    }
  }

  /**
   * Manejador para el proceso 'generate-thesis-structure'.
   */
  private async handleGenerateThesisStructure(job: Job<{ thesisId: string; dto: GenerateThesisDto }>): Promise<any> {
    const { thesisId, dto } = job.data;

    try {
      // 1. Actualizar estado a PROCESSING
      await (this.prisma as any).thesis.update({
        where: { id: thesisId },
        data: { status: 'PROCESSING' },
      });
      await job.updateProgress(10); // UI: Limpiando título (10 <= 15)
      this.logger.log(`Tesis ${thesisId} marcada como PROCESSING.`);

      // 2. Limpiar título de conectores y preposiciones para extraer palabras clave
      const keywords = this.extractKeywords(dto.title);
      this.logger.log(`Palabras clave extraídas del título: "${keywords}"`);
      await job.updateProgress(20); // UI: Buscando en CrossRef (20 <= 29)

      // 3. Consultar a CrossRefService para obtener exactamente 30 papers en inglés
      const papers = await this.crossRefService.searchPapers(keywords, 30);
      this.logger.log(`Obtenidas ${papers.length} referencias de CrossRef.`);
      await job.updateProgress(30); // UI: Iniciando Llamada 1 (30 <= 49)

      // Formatear las referencias para inyectarlas al prompt de Gemini
      const formattedReferences = papers
        .map(
          (p, idx) =>
            `Referencia ${idx + 1}: ${p.authors} (${p.year}). ${p.title}. ${p.journal}. DOI: ${p.doi}`,
        )
        .join('\n');

      // 4. Estructurar el System Prompt y llamadas secuenciales de Gemini (manteniendo el hilo de la sesión de chat)
      const systemPrompt = `Eres un asesor de tesis y redactor académico PhD de la Universidad Nacional de Trujillo (UNT), experto en redacción científica.
Tu objetivo es redactar borradores de tesis con el más alto rigor académico. 
Te comunicarás exclusivamente en español (citas en formato APA v7 y referencias científicas en inglés).
Normas críticas del documento:
- Fuente tipográfica: Arial Narrow.
- Tamaño de fuente: 12pt.
- Interlineado: 1.5.
- Margen Izquierdo: 3.0 cm.
- Otros Margenes (Superior, Derecho, Inferior): 2.5 cm.
- El Capítulo I (Introducción) y el análisis comparativo de las 3 metodologías deben redactarse OBLIGATORIAMENTE en prosa continua y SIN SUBTÍTULOS. Debe incluir implícitamente en la introducción: realidad problemática, antecedentes, marco teórico conceptual, justificación, hipótesis, objetivos y limitaciones. No debe contener títulos intermedios.
- DIRECTIVA CRÍTICA: ¡ESTÁ ESTRICTAMENTE PROHIBIDO EL USO DE SUBTÍTULOS, NUMERACIONES (ej. 2.1) O LISTAS CON VIÑETAS en el Capítulo I y en la Comparativa de Metodologías. Todo debe redactarse en PÁRRAFOS DE PROSA CONTINUA, fluidos y de transición natural!
- Debes comparar detalladamente 3 Metodologías Estándares alternativas para el desarrollo de la solución propuesta.
- Debes utilizar e integrar obligatoriamente las 30 referencias académicas reales en el texto mediante citas estrictas de formato APA v7.
- REGLA INFLEXIBLE DE REFERENCIAS (CUMPLE CUOTA MATEMÁTICA EXACTA 80/20): De las 30 referencias bibliográficas finales, es un requisito OBLIGATORIO que exactamente el 80% (24 referencias) sean artículos de revistas indexadas en idioma INGLÉS publicados en los últimos 5 años (2021-2026), y el 20% restante (6 referencias) sean libros físicos/digitales en ESPAÑOL publicados en los últimos 10 años (2016-2026). Traduce o complementa las referencias provistas por CrossRef para cumplir estrictamente con esta cuota matemática exacta bajo norma APA v7.`;

      this.logger.log('Iniciando sesión de chat con Gemini...');
      const chat = this.geminiService.createChatSession(systemPrompt);

      // Llamada 1: Generar Capítulo I (Introducción extensa en prosa continua)
      this.logger.log('Llamada 1: Generando Introducción (Capítulo I)...');
      const prompt1 = `Genera el Capítulo I completo (Introducción) para la siguiente propuesta de tesis:
Título: "${dto.title}"
Línea de Investigación UNT: "${dto.lineOfResearch}"
Campus: "${dto.campus}"
Autor: "${dto.authorName}"
Asesor: "${dto.advisorName}"

A continuación tienes exactamente 30 referencias científicas en inglés que debes inyectar y citar formalmente a lo largo del texto usando la norma APA v7:
${formattedReferences}

Instrucciones de Redacción del Capítulo I:
- Escríbelo de forma detallada y extensa en prosa continua (mínimo 1500 palabras).
- Está ESTRICTAMENTE PROHIBIDO incluir subtítulos dentro del Capítulo I (como "1.1 Antecedentes" o "1.2 Objetivos"). Debe fluir en párrafos estructurados que cubran consecutivamente la realidad problemática, antecedentes, justificación, hipótesis, objetivos y limitaciones sin interrupciones visuales de subtítulos.
- Cita al menos la mitad de las 30 referencias científicas provistas para dar sustento científico.`;

      const response1 = await chat.sendMessage(prompt1);
      const textIntroduction = response1.response.text();
      this.logger.log('Introducción generada exitosamente.');
      await job.updateProgress(50); // UI: Iniciando Llamada 2 (50 <= 69)

      // Retraso de 6 segundos para evitar error de cuota 429
      this.logger.log('Esperando 6 segundos antes de la Llamada 2 (cooldown de cuota API)...');
      await this.sleep(6000);

      // Llamada 2: Comparativa de 3 metodologías estándar alternativas
      this.logger.log('Llamada 2: Generando Comparativa de Metodologías...');
      const prompt2 = `Continuando con el borrador del proyecto de tesis, redacta ahora la sección de "Marco Teórico: Comparativa de Metodologías".
Describe y compara en detalle 3 Metodologías Estándares alternativas que sean idóneas para el desarrollo e implementación del proyecto "${dto.title}".
Para cada una de las 3 metodologías debes incluir:
1. Conceptos fundamentales y fases de implementación.
2. Ventajas y desventajas en el contexto específico de este proyecto.
3. Citas de soporte (usando las referencias científicas provistas anteriormente) en formato APA v7 al realizar contrastes metodológicos.

DIRECTIVA CRÍTICA:
¡ESTÁ ESTRICTAMENTE PROHIBIDO EL USO DE SUBTÍTULOS, NUMERACIONES (ej. 2.1) O LISTAS CON VIÑETAS!
Todo el análisis comparativo de las 3 metodologías debe ser redactado en PÁRRAFOS DE PROSA CONTINUA, fluidos y de transición natural.
Redacta una sección extensa y técnica (mínimo 1200 palabras).`;

      const response2 = await chat.sendMessage(prompt2);
      const textMethodologies = response2.response.text();
      this.logger.log('Sección de metodologías comparadas generada exitosamente.');
      await job.updateProgress(70); // UI: Iniciando Llamada 3 (70 < 100) - Empieza exactamente en 70%
 
      // Retraso de 6 segundos para evitar error de cuota 429
      this.logger.log('Esperando 6 segundos antes de la Llamada 3 (cooldown de cuota API)...');
      await this.sleep(6000);
 
      // Llamada 3: Consolidar y forzar salida JSON estructurada
      this.logger.log('Llamada 3: Consolidando contenido y forzando salida JSON estructurada...');
      const prompt3 = `Finalmente, consolida toda la información generada previamente (la portada de presentación, el Capítulo I completo en prosa continua, la Comparativa de las 3 Metodologías sin subtítulos y la lista completa de las 30 Referencias científicas finales) en un objeto JSON minimalista que contenga únicamente el array "pages".
No incluyas metadatos repetitivos, configuraciones de fuentes ni márgenes en la respuesta.

El JSON debe cumplir exactamente con esta estructura simplificada:
{
  "pages": [
    {
      "pageNumber": 1,
      "type": "cover",
      "title": "PORTADA",
      "content": {
        "institution": "UNIVERSIDAD NACIONAL DE TRUJILLO",
        "faculty": "FACULTAD DE INGENIERÍA",
        "school": "ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS",
        "year": "${new Date().getFullYear()}"
      }
    },
    {
      "pageNumber": 2,
      "type": "introduction",
      "title": "CAPÍTULO I: INTRODUCCIÓN",
      "content": "Inserta aquí el bloque de texto correspondiente a la primera parte del Capítulo I generado anteriormente en prosa continua y sin subtítulos."
    },
    {
      "pageNumber": 3,
      "type": "introduction",
      "title": "CAPÍTULO I: INTRODUCCIÓN (CONTINUACIÓN)",
      "content": "Inserta aquí el bloque de texto correspondiente a la segunda parte del Capítulo I generado anteriormente en prosa continua y sin subtítulos."
    },
    {
      "pageNumber": 4,
      "type": "introduction",
      "title": "CAPÍTULO I: INTRODUCCIÓN (CONTINUACIÓN)",
      "content": "Inserta aquí el bloque de texto correspondiente a la tercera parte del Capítulo I generado anteriormente en prosa continua y sin subtítulos."
    },
    {
      "pageNumber": 5,
      "type": "introduction",
      "title": "CAPÍTULO I: INTRODUCCIÓN (CONTINUACIÓN)",
      "content": "Inserta aquí el bloque de texto correspondiente a la cuarta parte del Capítulo I generado anteriormente en prosa continua y sin subtítulos."
    },
    {
      "pageNumber": 6,
      "type": "methodology",
      "title": "MARCO TEÓRICO: COMPARATIVA DE METODOLOGÍAS",
      "content": "Inserta aquí la primera parte de la comparativa detallada de las 3 metodologías estándar desarrollada previamente (sin subtítulos, viñetas ni numeraciones)."
    },
    {
      "pageNumber": 7,
      "type": "methodology",
      "title": "MARCO TEÓRICO: COMPARATIVA DE METODOLOGÍAS (CONTINUACIÓN)",
      "content": "Inserta aquí la segunda parte de la comparativa detallada de las 3 metodologías estándar desarrollada previamente (sin subtítulos, viñetas ni numeraciones)."
    },
    {
      "pageNumber": 8,
      "type": "methodology",
      "title": "MARCO TEÓRICO: COMPARATIVA DE METODOLOGÍAS (CONTINUACIÓN)",
      "content": "Inserta aquí la tercera parte de la comparativa detallada de las 3 metodologías estándar desarrollada previamente (sin subtítulos, viñetas ni numeraciones)."
    },
    {
      "pageNumber": 9,
      "type": "references",
      "title": "REFERENCIAS BIBLIOGRÁFICAS",
      "content": "Inserta aquí la primera parte de la lista completa de las 30 referencias bibliográficas. Deben estar en formato APA v7."
    },
    {
      "pageNumber": 10,
      "type": "references",
      "title": "REFERENCIAS BIBLIOGRÁFICAS (CONTINUACIÓN)",
      "content": "Inserta aquí la segunda parte de la lista completa de las 30 referencias bibliográficas. Deben estar en formato APA v7."
    }
  ]
}

REGLA INFLEXIBLE DE REFERENCIAS (CUMPLE CUOTA MATEMÁTICA EXACTA 80/20 Y ORDENACIÓN):
De las 30 referencias bibliográficas finales, es OBLIGATORIO que exactamente el 80% (24 referencias) sean artículos científicos indexados en INGLÉS de los últimos 5 años (2021-2026), y el 20% restante (6 referencias) sean libros en ESPAÑOL de los últimos 10 años (2016-2026).
PROHIBIDO categorizar o agrupar las referencias bibliográficas con subtítulos (ej. no uses 'Libros en Español' ni 'Artículos Científicos'). Las 30 referencias deben integrarse obligatoriamente en una ÚNICA LISTA continua, ordenada estrictamente en orden alfabético de la A a la Z, respetando el formato APA v7.

Reglas estrictas de salida:
- Devuelve ÚNICAMENTE el JSON crudo. No agregues introducciones como 'Aquí tienes el JSON:', ni bloques markdown de código del tipo \`\`\`json.
- Distribuye todo el contenido generado en exactamente 10 páginas como se ilustra.
- Asegúrate de que las citas y referencias del texto coincidan perfectamente.`;

      const response3 = await chat.sendMessage(prompt3);
      const rawJson = response3.response.text();
      
      // Limpiar y parsear JSON con saneamiento avanzado y tolerancia a fallos
      const parsedContent = this.cleanAndParseJSON(rawJson);

      await job.updateProgress(90); // UI: Estructurando JSON final (90 < 100)

      // Enriquecer el JSON retornado por Gemini con los metadatos completos del backend
      const parsedPages = parsedContent.pages || [];
      
      // Si por alguna razón la primera página no tiene los campos de carátula completos, los inyectamos
      if (parsedPages.length > 0 && parsedPages[0].type === 'cover') {
        parsedPages[0].content = {
          institution: parsedPages[0].content?.institution || "UNIVERSIDAD NACIONAL DE TRUJILLO",
          faculty: parsedPages[0].content?.faculty || "FACULTAD DE INGENIERÍA",
          school: parsedPages[0].content?.school || "ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS",
          title: dto.title,
          author: dto.authorName,
          advisor: dto.advisorName,
          campus: dto.campus,
          year: parsedPages[0].content?.year || String(new Date().getFullYear())
        };
      }

      const finalStructuredContent = {
        metadata: {
          title: dto.title,
          author: dto.authorName,
          advisor: dto.advisorName,
          lineOfResearch: dto.lineOfResearch,
          campus: dto.campus,
          formatting: {
            fontFamily: "Arial Narrow",
            fontSize: 12,
            lineSpacing: 1.5,
            margins: {
              left: "3.0cm",
              top: "2.5cm",
              right: "2.5cm",
              bottom: "2.5cm"
            }
          }
        },
        pages: parsedPages
      };

      // 5. Almacenar contenido estructurado en la tabla Thesis y pasar a COMPLETED
      await (this.prisma as any).thesis.update({
        where: { id: thesisId },
        data: {
          structuredContent: JSON.stringify(finalStructuredContent),
          status: 'COMPLETED',
        },
      });

      await job.updateProgress(100); // UI: Completado (100)
      this.logger.log(`Tesis ${thesisId} generada y completada con éxito.`);
      return { success: true, thesisId };

    } catch (error: any) {
      this.logger.error(`Error procesando la generación de tesis ${thesisId}: ${error.message}`);
      
      // Verificar si el error es por límite de tasa o cuota agotada (429)
      const isQuotaError = error.message?.includes('429') || 
                           error.message?.includes('Quota exceeded') ||
                           error.message?.includes('too many requests');

      if (isQuotaError) {
        this.logger.warn(`Detectado error de cuota/tasa de Gemini (429). Re-lanzando error para aplicar backoff exponencial en BullMQ sin marcar FAILED en base de datos.`);
        throw error; // Re-lanzar para activar el reintento de BullMQ configurado en el controlador
      }

      // Capturar falla de otro tipo y actualizar estado en Prisma
      await (this.prisma as any).thesis.update({
        where: { id: thesisId },
        data: { status: 'FAILED' },
      }).catch((dbErr: any) => this.logger.error(`Error al actualizar estado a FAILED en BD: ${dbErr.message}`));
      
      throw error;
    }
  }

  /**
   * Limpia conectores y caracteres especiales del título para extraer palabras clave.
   */
  private extractKeywords(title: string): string {
    const connectors = new Set([
      'de', 'la', 'el', 'y', 'en', 'para', 'con', 'un', 'una', 'los', 'las', 'del',
      'al', 'o', 'a', 'u', 'e', 'sobre', 'bajo', 'entre', 'hacia', 'desde', 'por',
      'según', 'sin', 'tras', 'mediante', 'durante', 'este', 'esta', 'estos',
      'estas', 'unos', 'unas', 'sus', 'su', 'como', 'que', 'cual', 'cuales', 'quien',
      'quienes', 'cuyo', 'cuya', 'cuyos', 'cuyas', 'para', 'para', 'del', 'los',
      'system', 'web', 'plataforma', 'development', 'desarrollo', 'implementacion',
      'diseño', 'sistema', 'automatico', 'automatizacion', 'herramienta', 'software',
    ]);

    const cleanTitle = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ') // Quitar puntuación
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleanTitle.split(' ');
    const keywords = words.filter((word) => word.length > 2 && !connectors.has(word));

    // Retorna las palabras claves más importantes (máximo 5) con el sufijo en inglés
    const baseKeywords = keywords.slice(0, 5).join(' ') || 'systems technology';
    return `${baseKeywords} system management software`;
  }

  /**
   * Sanea y repara cadenas JSON de salida con tolerancia a fallos.
   */
  private repairJSON(rawJson: string): string {
    let json = rawJson.trim();
    
    // 1. Quitar bloques markdown de codigo json si existen
    if (json.startsWith('```')) {
      json = json.replace(/^```[a-zA-Z]*\n/, '');
    }
    if (json.endsWith('```')) {
      json = json.replace(/\n```$/, '');
      json = json.replace(/```$/, '');
    }
    
    // Encontrar el inicio del JSON
    const firstBrace = json.indexOf('{');
    const firstBracket = json.indexOf('[');
    let startIndex = -1;
    
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIndex = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }
    
    if (startIndex !== -1) {
      json = json.substring(startIndex);
    }
    
    // 2. Escapar saltos de línea crudos dentro de las comillas dobles
    let inQuote = false;
    let escaped = false;
    let sanitized = '';
    
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      
      if (char === '\\') {
        escaped = !escaped;
        sanitized += char;
      } else if (char === '"') {
        if (!escaped) {
          inQuote = !inQuote;
        }
        escaped = false;
        sanitized += char;
      } else {
        escaped = false;
        if (inQuote) {
          if (char === '\n') {
            sanitized += '\\n';
          } else if (char === '\r') {
            sanitized += '\\r';
          } else if (char === '\t') {
            sanitized += '\\t';
          } else {
            sanitized += char;
          }
        } else {
          sanitized += char;
        }
      }
    }
    json = sanitized;

    // 3. Balancear corchetes, llaves y comillas si quedó truncado
    inQuote = false;
    escaped = false;
    const stack: string[] = [];
    
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      if (char === '\\') {
        escaped = !escaped;
      } else if (char === '"') {
        if (!escaped) {
          inQuote = !inQuote;
        }
        escaped = false;
      } else {
        escaped = false;
        if (!inQuote) {
          if (char === '{' || char === '[') {
            stack.push(char);
          } else if (char === '}') {
            if (stack.length && stack[stack.length - 1] === '{') {
              stack.pop();
            }
          } else if (char === ']') {
            if (stack.length && stack[stack.length - 1] === '[') {
              stack.pop();
            }
          }
        }
      }
    }
    
    // Si quedó en medio de comillas al truncarse, cerramos la comilla
    if (inQuote) {
      json += '"';
    }
    
    // Cerramos las llaves o corchetes que quedaron abiertos en orden inverso
    while (stack.length > 0) {
      const open = stack.pop();
      if (open === '{') {
        json += '}';
      } else if (open === '[') {
        json += ']';
      }
    }
    
    return json;
  }

  /**
   * Limpia el texto retornado por la IA de bloques Markdown y lo parsea a JSON.
   */
  private cleanAndParseJSON(text: string): any {
    const repairedText = this.repairJSON(text);

    try {
      return JSON.parse(repairedText);
    } catch (err) {
      this.logger.error('Error al parsear el JSON de la IA. Intentando saneamiento de comillas...');
      // Reintentar limpiando caracteres extraños si falla
      try {
        const sanitized = repairedText
          .replace(/[\u201C\u201D]/g, '"') // Reemplazar comillas tipográficas
          .replace(/[\u2018\u2019]/g, "'");
        return JSON.parse(sanitized);
      } catch (innerErr: any) {
        throw new Error(`JSON no válido retornado por Gemini: ${innerErr.message}. Texto original: ${text}`);
      }
    }
  }
}
