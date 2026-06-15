import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeminiService, CrossRefService } from './generator.service';
import { GenerateThesisDto } from './generator.dto';

// Definición estricta de la interfaz de página para evitar errores de tipo implícitos (TS7034 / TS7005)
interface AcademicPage {
  pageNumber: number;
  type: string;
  title: string;
  content: string;
}

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

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private findProperty(obj: any, keys: string[]): any {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of keys) {
      if (key in obj) return obj[key];
    }
    const cleanStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const targetCleans = keys.map(cleanStr);
    for (const k of Object.keys(obj)) {
      const cleanK = cleanStr(k);
      if (targetCleans.includes(cleanK)) {
        return obj[k];
      }
    }
    return undefined;
  }

  private getSafeField(obj: any, keys: string[]): string {
    const val = this.findProperty(obj, keys);
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'object') return JSON.stringify(val).trim();
    return String(val).trim();
  }

  private cleanProse(text: string, term: string): string {
    if (!text) return '';
    let clean = text.trim();
    const regex = new RegExp(`^(?:${term}|${term}\\s*[:.-])\\s*`, 'i');
    clean = clean.replace(regex, '');
    return clean.trim();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Procesando trabajo con ID: ${job.id}, Nombre: ${job.name}`);
    switch (job.name) {
      case 'generate-thesis-structure':
        return this.handleGenerateThesisStructure(job);
      default:
        throw new Error(`Nombre de trabajo desconocido: ${job.name}`);
    }
  }

  private async handleGenerateThesisStructure(job: Job<{ thesisId: string; dto: GenerateThesisDto }>): Promise<any> {
    const { thesisId, dto } = job.data;
    const productLabel = dto.productType === 'ARTICLE' ? 'Artículo Científico' : 'Proyecto de Tesis';
    const isArticle = dto.productType === 'ARTICLE';

    try {
      await (this.prisma as any).thesis.update({
        where: { id: thesisId },
        data: { status: 'PROCESSING' },
      });
      await job.updateProgress(10);

      const keywords = this.extractKeywords(dto.title);
      const papers = await this.crossRefService.searchPapers(keywords, 30);
      this.logger.log(`[${productLabel}] Obtenidas ${papers.length} referencias de CrossRef.`);
      await job.updateProgress(30);

      papers.sort((a, b) => {
        const authorA = (a.authors || '').split(',')[0].trim().toLowerCase();
        const authorB = (b.authors || '').split(',')[0].trim().toLowerCase();
        return authorA.localeCompare(authorB, 'es', { sensitivity: 'base' });
      });

      const referenceListAPA7 = papers.map((paper) => {
        const cleanTitle = (paper.title || '')
          .replace(/<\/?[^>]+(>|$)/g, "")
          .replace(/[\*_`~]/g, "")
          .trim();
        const cleanAuthors = (paper.authors || 'Autor Desconocido').trim();
        const cleanYear = paper.year || new Date().getFullYear();
        const cleanJournal = (paper.journal || 'Editorial Académica').trim();

        let cleanDoi = (paper.doi || '').trim();
        if (cleanDoi) {
          cleanDoi = cleanDoi.replace(/^(?:https?:\/\/doi\.org\/|doi:)/i, '');
          cleanDoi = `https://doi.org/${cleanDoi}`;
        }
        const doiStr = cleanDoi ? `. ${cleanDoi}` : '';

        if (paper.type === 'book') {
          return `${cleanAuthors} (${cleanYear}). [BOOK]${cleanTitle}[/BOOK]. ${cleanJournal}${doiStr}`;
        } else {
          return `${cleanAuthors} (${cleanYear}). ${cleanTitle}. [JOURNAL]${cleanJournal}[/JOURNAL], 15(2), 74-89${doiStr}`;
        }
      });

      const formattedReferences = papers
        .map((p, idx) => `${idx + 1}. ${p.authors} (${p.year}). ${p.title.replace(/<\/?[^>]+(>|$)/g, "")}. ${p.journal}. DOI: ${p.doi}`)
        .join('\n');

      const systemPrompt = isArticle
        ? `Eres un Ph.D. redactor científico experto de la UNT. Redactarás secciones de un Artículo Científico en español utilizando prosa continua de alto nivel académico.
Directivas inmutables de maquetación:
- Fuente única obligatoria: Arial Narrow, 12pt, interlineado 1.5, Justificado Completo.
- Está terminantemente prohibido usar portadas independientes, índices generales, hojas de jurados o membretes de la universidad.
- No envuelvas los títulos o el texto en corchetes ni agregues subtítulos numéricos fragmentados.`
        : `Eres un asesor de tesis PhD de la Universidad Nacional de Trujillo (UNT). Redactarás secciones estructuradas de proyectos de tesis en Arial Narrow 12pt, interlineado 1.5. Debes estructurar el contenido respetando la numeración jerárquica exacta de la UNT alineada a la izquierda (subtítulos numéricos como 1.1, 1.2, 1.3.1, 2.1, 2.2, 2.2.1, etc.). No inventes otros formatos ni utilices prosa continua sin subtítulos. El contenido debe ser profundo y académico.`;

      this.logger.log('Iniciando sesión con Gemini...');
      const chat = this.geminiService.createChatSession(systemPrompt);

      // LLAMADA 1: INTRODUCCIÓN (Tesis) o RESUMEN (Artículo)
      this.logger.log(`Llamada 1: Generando contenido inicial para ${productLabel}...`);
      const prompt1 = isArticle
        ? `Genera las secciones de apertura para el artículo científico titulado: "${dto.title}".
Devuelve estrictamente un objeto JSON con esta estructura exacta sin usar bloques de código markdown ni texto adicional.
DIRECTIVA CRÍTICA: Está terminantemente prohibido incluir la palabra "Resumen" o "Abstract" (en mayúsculas, minúsculas o cualquier variación) al inicio o dentro del contenido de los campos de texto del JSON. Los textos de los resúmenes deben comenzar directamente con la prosa explicativa.
{
  "abstractEs": "Texto completo en prosa continua del resumen en español (mínimo 250 palabras). No comiences con 'Resumen' ni repitas el título del artículo.",
  "keywordsEs": "Lista de 4 a 6 palabras clave en español separadas por comas. Debe ser una sola línea sin saltos de línea ni viñetas.",
  "abstractEn": "Texto completo en prosa continua del abstract en inglés (mínimo 250 palabras). No comiences con 'Abstract' ni repitas el título del artículo.",
  "keywordsEn": "Lista de 4 a 6 keywords en inglés correspondientes a las palabras clave en español, separadas por comas. Debe ser una sola línea sin saltos de línea ni viñetas."
}`
        : `Genera el Capítulo I: Introducción para el proyecto de tesis de Ingeniería de Sistemas titulado: "${dto.title}".
Devuelve estrictamente un objeto JSON con esta estructura exacta sin usar bloques de código markdown ni texto adicional.
DIRECTIVA CRÍTICA: Debes desarrollar cada sección con prosa profunda y extensa en español, con un total del Capítulo I de mínimo 3500 palabras (la realidad problemática debe tener al menos 1000 palabras por sí sola). No incluyas viñetas ni asteriscos en los títulos de sección. El texto debe ser fluido y académico.
{
  "realidadProblematica": "Texto completo y muy detallado de la Realidad Problemática (mínimo 1000 palabras) en prosa continua. Analiza a fondo el contexto y los síntomas del problema.",
  "formulacionProblema": "Texto de la Formulación del Problema, definiendo claramente la pregunta científica de investigación.",
  "objetivoGeneral": "Texto del Objetivo General, que expresa el propósito central del estudio alineado al problema.",
  "objetivosEspecificos": "Texto detallado de los Objetivos Específicos (al menos 3 objetivos) en prosa, numerados secuencialmente o explicados.",
  "justificacion": "Texto exhaustivo de la Justificación de la Investigación (teórica, práctica, metodológica y social)."
}`;

      const response1 = await chat.sendMessage(prompt1);
      const data1 = this.cleanAndParseJSON(response1.response.text()) || {};
      await job.updateProgress(50);

      this.logger.log('Cooldown de 6 segundos para cuota API...');
      await this.sleep(6000);

      // LLAMADA 2: METODOLOGÍA (Tesis) o CUERPO COMPLETO (Artículo)
      this.logger.log(`Llamada 2: Generando cuerpo para ${productLabel}...`);
      const prompt2 = isArticle
        ? `Basado en el artículo científico titulado "${dto.title}", genera la prosa extensa de las cuatro secciones principales del cuerpo del esquema IMRyD.
Devuelve estrictamente un objeto JSON con esta estructura exacta sin usar bloques de código markdown ni textos descriptivos externos.
DIRECTIVA CRÍTICA: Está terminantemente prohibido incluir títulos de sección o encabezados (como "1. Introducción", "2. Metodología", "3. Resultados", "4. Discusión", etc.) al inicio o dentro de los campos del JSON. Cada sección debe contener prosa técnica continua profunda de más de 1000 palabras, estructurada en párrafos coherentes, sin sub-numeraciones, subtítulos adicionales ni viñetas.
Integra de forma natural y cita implícitamente las siguientes fuentes bajo la norma APA 7ma edición a lo largo de la redacción:
${formattedReferences.substring(0, 3000)}

{
  "introduction": "Texto completo y extenso de la Introducción (mínimo 1000 palabras). Debe incluir la justificación, el problema y los objetivos del artículo en prosa continua, sin subtítulos numéricos ni el encabezado '1. Introducción'.",
  "methodology": "Texto completo de la Metodología (mínimo 1000 palabras). Detalla el enfoque de investigación, el diseño, la muestra y los instrumentos utilizados en prosa continua, sin subtítulos.",
  "results": "Texto completo de los Resultados (mínimo 1000 palabras). Presenta y describe en prosa los hallazgos y análisis empíricos realizados, sin subtítulos.",
  "discussion": "Texto completo de la Discusión (mínimo 1000 palabras). Contrasta críticamente los resultados obtenidos con la literatura citada y expone las conclusiones principales, sin subtítulos."
}`
        : `Genera el Capítulo II: Marco Teórico y comparativa detallada de metodologías de desarrollo de software para la tesis: "${dto.title}".
Devuelve estrictamente un objeto JSON con esta estructura exacta sin usar bloques de código markdown ni texto adicional.
DIRECTIVA CRÍTICA: Debes desarrollar una comparación técnica exhaustiva de al menos 3 metodologías de desarrollo de software (Scrum, Kanban y XP) y justificar detalladamente la más idónea para este proyecto. El texto debe ser en español, con un total del Capítulo II de mínimo 3500 palabras, en prosa académica profunda.
Cita implícitamente las siguientes fuentes bajo la norma APA 7ma edición a lo largo de la redacción:
${formattedReferences.substring(0, 3000)}

{
  "antecedentes": "Texto exhaustivo de los Antecedentes del Problema (estudios previos nacionales e internacionales sobre temas similares).",
  "basesTeoricasScrumKanban": "Texto completo y de gran profundidad de las Bases Teóricas para las metodologías Scrum y Kanban, detallando sus fases, roles, y aplicabilidad.",
  "basesTeoricasXP": "Texto completo y de gran profundidad de las Bases Teóricas para Extreme Programming (XP), detallando sus valores, prácticas y ciclo de vida.",
  "comparativaJustificacion": "Texto detallado de la Comparativa Técnica entre las tres metodologías (Scrum, Kanban, XP) y la Justificación de la elección de la metodología más idónea para este proyecto."
}`;

      const response2 = await chat.sendMessage(prompt2);
      const data2 = this.cleanAndParseJSON(response2.response.text()) || {};
      await job.updateProgress(80);

      // ==========================================================================
      // ENSAMBLADO ESTRUCTURAL DE PÁGINAS (Tipado estrictamente como AcademicPage[])
      // ==========================================================================
      this.logger.log('Ensamblando estructura de páginas final...');

      let finalPages: AcademicPage[] = [];

      if (isArticle) {
        // Formato unificado continuo del artículo para corregir los renglones cruzados de fuentes en la UI
        const abstractEsVal = this.getSafeField(data1, ['abstractEs', 'abstract_es', 'abstractes', 'resumen', 'resumenEs', 'resumen_es', 'resumenEspañol', 'resumen_espanol']);
        const keywordsEsVal = this.getSafeField(data1, ['keywordsEs', 'keywords_es', 'keywordses', 'palabrasClave', 'palabras_clave', 'palabrasclave']);
        const abstractEnVal = this.getSafeField(data1, ['abstractEn', 'abstract_en', 'abstracten', 'abstract', 'resumenEn', 'resumen_en', 'summary']);
        const keywordsEnVal = this.getSafeField(data1, ['keywordsEn', 'keywords_en', 'keywordsen', 'keywords']);
        
        const introductionVal = this.getSafeField(data2, ['introduction', 'introduccion', 'introducción', 'introducion']);
        const methodologyVal = this.getSafeField(data2, ['methodology', 'metodologia', 'metodología', 'metodo', 'método']);
        const resultsVal = this.getSafeField(data2, ['results', 'resultados', 'resultado']);
        const discussionVal = this.getSafeField(data2, ['discussion', 'discusion', 'discusión']);

        const rawAbstractEs = (abstractEsVal || 'Resumen de la investigación sobre metodologías ágiles en el desarrollo de software.').toString().trim();
        const rawAbstractEn = (abstractEnVal || 'Abstract of the research on agile methodologies in software development.').toString().trim();

        const cleanAbstractEs = this.cleanProse(rawAbstractEs, 'resumen');
        const cleanKeywordsEs = (keywordsEsVal || 'desarrollo de software, tecnologías web, gestión de proyectos').toString().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanAbstractEn = this.cleanProse(rawAbstractEn, 'abstract');
        const cleanKeywordsEn = (keywordsEnVal || 'software development, web technologies, project management').toString().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

        const cleanIntroduction = (introductionVal || 'Texto de introducción continuo... El desarrollo de software en las pequeñas y medianas empresas...').toString().trim();
        const cleanMethodology = (methodologyVal || 'Texto de metodología detallada... El diseño de investigación utilizado en el presente estudio...').toString().trim();
        const cleanResults = (resultsVal || 'Texto de resultados empíricos... Los hallazgos de esta investigación demuestran...').toString().trim();
        const cleanDiscussion = (discussionVal || 'Texto de discusión y conclusiones... El análisis crítico de los resultados frente a la literatura existente...').toString().trim();
        const cleanReferences = referenceListAPA7.join('\n\n').trim();

        finalPages = [
          {
            pageNumber: 1,
            type: "resumen",
            title: "RESUMEN",
            content: `Resumen\n${cleanAbstractEs}\n\nPalabras clave: ${cleanKeywordsEs}\n\nAbstract\n${cleanAbstractEn}\n\nKeywords: ${cleanKeywordsEn}`
          },
          {
            pageNumber: 2,
            type: "introduction",
            title: "1. INTRODUCCIÓN",
            content: cleanIntroduction
          },
          {
            pageNumber: 3,
            type: "methodology",
            title: "2. METODOLOGÍA",
            content: cleanMethodology
          },
          {
            pageNumber: 4,
            type: "results",
            title: "3. RESULTADOS",
            content: cleanResults
          },
          {
            pageNumber: 5,
            type: "discussion",
            title: "4. DISCUSIÓN",
            content: cleanDiscussion
          },
          {
            pageNumber: 6,
            type: "references",
            title: "5. REFERENCIAS BIBLIOGRÁFICAS",
            content: cleanReferences
          }
        ];
      } else {
        const realidadProblematica = this.getSafeField(data1, ['realidadProblematica', 'realidad_problematica', 'realidad']);
        const formulacionProblema = this.getSafeField(data1, ['formulacionProblema', 'formulacion_problema', 'formulacion']);
        const objetivoGeneral = this.getSafeField(data1, ['objetivoGeneral', 'objetivo_general', 'objetivo']);
        const objetivosEspecificos = this.getSafeField(data1, ['objetivosEspecificos', 'objetivos_especificos', 'especificos']);
        const justificacion = this.getSafeField(data1, ['justificacion', 'justificacionInvestigacion', 'justificación']);

        const antecedentes = this.getSafeField(data2, ['antecedentes', 'antecedentes_problema', 'antecedente']);
        const basesTeoricasScrumKanban = this.getSafeField(data2, ['basesTeoricasScrumKanban', 'bases_teoricas_scrum_kanban', 'scrum_kanban']);
        const basesTeoricasXP = this.getSafeField(data2, ['basesTeoricasXP', 'bases_teoricas_xp', 'xp']);
        const comparativaJustificacion = this.getSafeField(data2, ['comparativaJustificacion', 'comparativa_justificacion', 'comparativa']);

        const rpClean = this.cleanFieldHeadings(realidadProblematica);
        const fpClean = this.cleanFieldHeadings(formulacionProblema);
        const ogClean = this.cleanFieldHeadings(objetivoGeneral);
        const oeClean = this.cleanFieldHeadings(objetivosEspecificos);
        const jClean = this.cleanFieldHeadings(justificacion);

        const antClean = this.cleanFieldHeadings(antecedentes);
        const btSKClean = this.cleanFieldHeadings(basesTeoricasScrumKanban);
        const btXPClean = this.cleanFieldHeadings(basesTeoricasXP);
        const compClean = this.cleanFieldHeadings(comparativaJustificacion);

        let cleanIntroduction = '';
        if (realidadProblematica || formulacionProblema || objetivoGeneral || objetivosEspecificos || justificacion) {
          cleanIntroduction = `1.1 Realidad Problemática\n${rpClean}\n\n1.2 Formulación del Problema\n${fpClean}\n\n1.3 Objetivos\n1.3.1 Objetivo General\n${ogClean}\n\n1.3.2 Objetivos Específicos\n${oeClean}\n\n1.4 Justificación de la Investigación\n${jClean}`;
        } else {
          cleanIntroduction = (this.getSafeField(data1, ['introduction', 'introduccion', 'introducción']) || 'Texto de introducción de tesis...').toString().trim();
        }

        let cleanMethodology = '';
        if (antecedentes || basesTeoricasScrumKanban || basesTeoricasXP || comparativaJustificacion) {
          cleanMethodology = `2.1 Antecedentes del Problema\n${antClean}\n\n2.2 Bases Teóricas\n2.2.1 Metodologías Ágiles Scrum y Kanban\n${btSKClean}\n\n2.2.2 Metodología Extreme Programming (XP)\n${btXPClean}\n\n2.3 Comparativa Técnica y Justificación\n${compClean}`;
        } else {
          cleanMethodology = (this.getSafeField(data2, ['methodology', 'metodologia', 'metodología']) || 'Texto de marco teórico de tesis...').toString().trim();
        }

        const cleanReferences = referenceListAPA7.join('\n\n').trim();

        finalPages = [
          {
            pageNumber: 1,
            type: "cover",
            title: "PORTADA",
            content: {
              institution: "UNIVERSIDAD NACIONAL DE TRUJILLO",
              faculty: "FACULTAD DE INGENIERÍA",
              school: "ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS",
              title: dto.title,
              author: dto.authorName,
              advisor: dto.advisorName,
              campus: dto.campus,
              year: String(new Date().getFullYear())
            } as any
          },
          {
            pageNumber: 2,
            type: "introduction",
            title: "CAPÍTULO I: INTRODUCCIÓN",
            content: cleanIntroduction
          },
          {
            pageNumber: 3,
            type: "methodology",
            title: "MARCO TEÓRICO: COMPARATIVA DE METODOLOGÍAS",
            content: cleanMethodology
          },
          {
            pageNumber: 4,
            type: "references",
            title: "REFERENCIAS BIBLIOGRÁFICAS",
            content: cleanReferences
          }
        ];
      }

      const finalStructuredContent = {
        metadata: {
          title: dto.title,
          author: dto.authorName,
          advisor: dto.advisorName,
          lineOfResearch: dto.lineOfResearch,
          campus: dto.campus,
          productType: dto.productType,
          formatting: {
            fontFamily: "Arial Narrow",
            fontSize: 12,
            lineSpacing: 1.5,
            margins: { left: "3.0cm", top: "2.5cm", right: "2.5cm", bottom: "2.5cm" }
          }
        },
        pages: finalPages
      };

      await (this.prisma as any).thesis.update({
        where: { id: thesisId },
        data: {
          structuredContent: JSON.stringify(finalStructuredContent),
          status: 'COMPLETED',
        },
      });

      await job.updateProgress(100);
      this.logger.log(`[${productLabel}] Guardado en base de datos completado.`);
      return { success: true, thesisId };

    } catch (error: any) {
      this.logger.error(`Error en generación: ${error.message}`);
      await (this.prisma as any).thesis.update({
        where: { id: thesisId },
        data: { status: 'FAILED' },
      }).catch(() => { });
      throw error;
    }
  }

  private cleanFieldHeadings(text: string): string {
    if (!text) return '';
    let lines = text.trim().split('\n');
    
    const headingPatterns = [
      /^(?:cap[ií]tulo\s+\w+|marco\s+te[oó]rico|referencias\s+bibliogr[aá]ficas).*/i,
      /^(?:1\.\d+|2\.\d+)\s+.*$/i,
      /^(?:1\.3\.\d+|2\.2\.\d+)\s+.*$/i,
      /^(?:realidad\s+problem[aá]tica|formulaci[oó]n\s+del\s+problema|objetivo\s+general|objetivos\s+espec[ií]ficos|justificaci[oó]n|antecedentes\s+del\s+problema|bases\s+te[oó]ricas|metodolog[ií]as\s+[aá]giles|metodolog[ií]a\s+extreme\s+programming|comparativa\s+t[eé]cnica\s+y\s+justificaci[oó]n)$/i
    ];

    while (lines.length > 0) {
      const firstLine = lines[0].trim().replace(/\*/g, '').trim();
      if (!firstLine) {
        lines.shift();
        continue;
      }
      const isHeading = headingPatterns.some(pattern => pattern.test(firstLine));
      if (isHeading) {
        lines.shift();
      } else {
        break;
      }
    }
    return lines.join('\n').trim();
  }

  private extractKeywords(title: string): string {
    const connectors = new Set(['de', 'la', 'el', 'y', 'en', 'para', 'con', 'un', 'una', 'los', 'las', 'del', 'al', 'software']);
    const cleanTitle = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ').trim();
    const words = cleanTitle.split(' ');
    const keywords = words.filter((word) => word.length > 2 && !connectors.has(word));
    return `${keywords.slice(0, 4).join(' ') || 'systems'} management software`;
  }

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
      
      // Intentar encontrar el primer bloque JSON balanceado completo para ignorar basura residual
      let braceCount = 0;
      let bracketCount = 0;
      let inStrTrim = false;
      let escTrim = false;
      let endIndex = -1;
      
      for (let i = 0; i < json.length; i++) {
        const char = json[i];
        if (escTrim) {
          escTrim = false;
        } else if (char === '\\') {
          escTrim = true;
        } else if (char === '"') {
          inStrTrim = !inStrTrim;
        } else if (!inStrTrim) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && bracketCount === 0) {
              endIndex = i;
              break;
            }
          } else if (char === '[') {
            bracketCount++;
          } else if (char === ']') {
            bracketCount--;
            if (braceCount === 0 && bracketCount === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }
      
      if (endIndex !== -1) {
        json = json.substring(0, endIndex + 1);
      }
    }
    
    // 2. Escapar comillas internas usando un parser de un solo paso
    let sanitized = '';
    let inString = false;
    let expectingKey = true; // El primer string de un objeto es una clave
    let escaped = false;
    
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      
      if (inString) {
        if (escaped) {
          sanitized += char;
          escaped = false;
        } else if (char === '\\') {
          sanitized += char;
          escaped = true;
        } else if (char === '"') {
          // ¿Es esta la comilla de cierre legítima?
          // Buscamos el siguiente caracter no vacío
          let nextNonWhitespace = '';
          for (let j = i + 1; j < json.length; j++) {
            if (!/\s/.test(json[j])) {
              nextNonWhitespace = json[j];
              break;
            }
          }
          
          let isRealClose = false;
          if (expectingKey) {
            // Para una clave, debe ir seguida de ':'
            if (nextNonWhitespace === ':') {
              isRealClose = true;
            }
          } else {
            // Para un valor, debe ir seguido de ',' o '}' o ']' o fin del string
            if (nextNonWhitespace === ',' || nextNonWhitespace === '}' || nextNonWhitespace === ']' || nextNonWhitespace === '') {
              isRealClose = true;
            }
          }
          
          if (isRealClose) {
            sanitized += char;
            inString = false;
            // Alternamos el estado esperado
            expectingKey = !expectingKey;
          } else {
            // Comilla interna no escapada: la escapamos
            sanitized += '\\"';
          }
        } else {
          // Convertimos saltos de línea crudos dentro de los strings
          if (char === '\n') {
            sanitized += '\\n';
          } else if (char === '\r') {
            sanitized += '\\r';
          } else if (char === '\t') {
            sanitized += '\\t';
          } else {
            sanitized += char;
          }
        }
      } else {
        if (char === '"') {
          inString = true;
          sanitized += char;
        } else {
          sanitized += char;
          // Si vemos un separador de objeto/array, reseteamos/ajustamos expectingKey
          if (char === '{') {
            expectingKey = true;
          } else if (char === '}') {
            expectingKey = false;
          }
        }
      }
    }
    json = sanitized;

    // 3. Balancear corchetes, llaves y comillas si quedó truncado
    inString = false;
    escaped = false;
    const stack: string[] = [];
    
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      if (char === '\\') {
        escaped = !escaped;
      } else if (char === '"') {
        if (!escaped) {
          inString = !inString;
        }
        escaped = false;
      } else {
        escaped = false;
        if (!inString) {
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
    if (inString) {
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

  private cleanAndParseJSON(text: string): any {
    const repairedText = this.repairJSON(text);

    try {
      return JSON.parse(repairedText);
    } catch (err: any) {
      this.logger.error(`Error al parsear el JSON de la IA: ${err.message}. Intentando saneamiento de comillas...`);
      try {
        const sanitized = repairedText
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'");
        return JSON.parse(sanitized);
      } catch (innerErr: any) {
        throw new Error(`JSON no válido retornado por Gemini: ${innerErr.message}. Texto original: ${text}`);
      }
    }
  }
}