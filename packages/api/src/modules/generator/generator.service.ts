import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private readonly logger = new Logger(GeminiService.name);

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.logger.log(`GeminiService inicializado (Modelo: ${this.modelName})`);
  }

  /**
   * Crea una nueva sesión de chat interactiva manteniendo el contexto.
   * @param systemInstruction Directiva o rol inicial para el modelo.
   */
  createChatSession(systemInstruction?: string) {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction ? { role: 'system', parts: [{ text: systemInstruction }] } : undefined,
    });

    return model.startChat({
      history: [],
    });
  }
}

@Injectable()
export class CrossRefService {
  private mailto: string;
  private readonly logger = new Logger(CrossRefService.name);

  constructor() {
    this.mailto = process.env.CROSSREF_MAILTO || 'test@universidad.edu.pe';
  }

  /**
   * Busca artículos científicos reales usando la API pública de CrossRef.
   * @param keywords Palabras clave limpiadas para la búsqueda.
   * @param count Cantidad exacta de artículos a retornar.
   */
  async searchPapers(keywords: string, count: number = 30): Promise<any[]> {
    this.logger.log(`Iniciando búsqueda bilingüe segregada en CrossRef para: "${keywords}"`);
    
    const seenDOIs = new Set<string>();
    const seenTitles = new Set<string>();
    
    // Helper para realizar la petición HTTP a CrossRef
    const fetchFromCrossRef = async (queryStr: string, rows: number): Promise<any[]> => {
      try {
        const encoded = encodeURIComponent(queryStr);
        const url = `https://api.crossref.org/works?query=${encoded}&rows=${rows}&mailto=${this.mailto}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`CrossRef API respondió con status ${response.status}`);
        }
        const data = await response.json() as any;
        return data.message?.items || [];
      } catch (err: any) {
        this.logger.error(`Error de red al consultar CrossRef para "${queryStr}": ${err.message}`);
        return [];
      }
    };

    // Helper de validación de papers (filtros anti-basura y anti-anónimos)
    const isValidPaper = (item: any): boolean => {
      const doi = item.DOI || item.doi;
      if (!doi || typeof doi !== 'string' || !doi.trim()) return false;
      
      const title = item.title?.[0];
      if (!title || typeof title !== 'string' || !title.trim()) return false;
      
      const year = item.published?.['date-parts']?.[0]?.[0]?.toString() ||
                   item.issued?.['date-parts']?.[0]?.[0]?.toString() ||
                   item['published-print']?.['date-parts']?.[0]?.[0]?.toString();
      if (!year || !year.trim()) return false;

      if (!item.author || !Array.isArray(item.author) || item.author.length === 0) return false;
      
      let hasValidFamilyName = false;
      for (const a of item.author) {
        if (!a) return false;
        const given = (a.given || '').trim();
        const family = (a.family || '').trim();
        
        const fullName = `${given} ${family}`.trim().toLowerCase();
        if (!fullName || fullName === 'anonymous' || fullName === 'anonimo') {
          return false;
        }
        if (family) {
          hasValidFamilyName = true;
        }
      }
      
      return hasValidFamilyName;
    };

    // Helper para dar formato APA v7 a la lista de autores
    const formatAuthors = (authorsArray: any[]): string => {
      return authorsArray.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).join(', ');
    };

    // 1. LOTE EN INGLÉS (Objetivo: 24 referencias)
    const englishPapers: any[] = [];
    const baseKeywords = keywords.replace(/\s*system\s+management\s+software/gi, '').trim();
    const primaryEnglishQuery = `${baseKeywords} system software artificial intelligence`;

    this.logger.log(`[CrossRef] Intentando consulta primaria en inglés: "${primaryEnglishQuery}"`);
    const englishItems = await fetchFromCrossRef(primaryEnglishQuery, 100);
    
    for (const item of englishItems) {
      if (englishPapers.length >= 24) break;
      if (!isValidPaper(item)) continue;
      
      const doi = (item.DOI || item.doi).trim().toLowerCase();
      const title = item.title[0].trim().toLowerCase();
      
      if (seenDOIs.has(doi) || seenTitles.has(title)) continue;
      
      seenDOIs.add(doi);
      seenTitles.add(title);
      
      const year = item.published?.['date-parts']?.[0]?.[0]?.toString() ||
                   item.issued?.['date-parts']?.[0]?.[0]?.toString() ||
                   item['published-print']?.['date-parts']?.[0]?.[0]?.toString();
      
      englishPapers.push({
        doi: item.DOI || item.doi,
        title: item.title[0],
        year,
        authors: formatAuthors(item.author),
        journal: item['container-title']?.[0] || 'International Journal of Scientific Studies',
      });
    }

    // Fallback/expansión para Inglés si no se completan los 24
    if (englishPapers.length < 24) {
      const relaxedEnglishQuery = 'artificial intelligence software engineering';
      this.logger.log(`[CrossRef] Lote inglés incompleto (${englishPapers.length}/24). Intentando expansión de búsqueda: "${relaxedEnglishQuery}"`);
      const backupItems = await fetchFromCrossRef(relaxedEnglishQuery, 100);
      
      for (const item of backupItems) {
        if (englishPapers.length >= 24) break;
        if (!isValidPaper(item)) continue;
        
        const doi = (item.DOI || item.doi).trim().toLowerCase();
        const title = item.title[0].trim().toLowerCase();
        
        if (seenDOIs.has(doi) || seenTitles.has(title)) continue;
        
        seenDOIs.add(doi);
        seenTitles.add(title);
        
        const year = item.published?.['date-parts']?.[0]?.[0]?.toString() ||
                     item.issued?.['date-parts']?.[0]?.[0]?.toString() ||
                     item['published-print']?.['date-parts']?.[0]?.[0]?.toString();
        
        englishPapers.push({
          doi: item.DOI || item.doi,
          title: item.title[0],
          year,
          authors: formatAuthors(item.author),
          journal: item['container-title']?.[0] || 'International Journal of Scientific Studies',
        });
      }
    }

    if (englishPapers.length < 24) {
      throw new Error(`[CrossRef Error] No se pudo obtener el mínimo de 24 referencias válidas y únicas en inglés (se obtuvieron ${englishPapers.length}).`);
    }

    // 2. LOTE EN ESPAÑOL (Objetivo: 6 referencias)
    const spanishPapers: any[] = [];
    const spanishKeywords = keywords.replace(/\s*system\s+management\s+software/gi, '').trim() || 'tecnologia sistemas';

    this.logger.log(`[CrossRef] Intentando consulta primaria en español: "${spanishKeywords}"`);
    const spanishItems = await fetchFromCrossRef(spanishKeywords, 50);
    
    for (const item of spanishItems) {
      if (spanishPapers.length >= 6) break;
      if (!isValidPaper(item)) continue;
      
      const doi = (item.DOI || item.doi).trim().toLowerCase();
      const title = item.title[0].trim().toLowerCase();
      
      if (seenDOIs.has(doi) || seenTitles.has(title)) continue;
      
      seenDOIs.add(doi);
      seenTitles.add(title);
      
      const year = item.published?.['date-parts']?.[0]?.[0]?.toString() ||
                   item.issued?.['date-parts']?.[0]?.[0]?.toString() ||
                   item['published-print']?.['date-parts']?.[0]?.[0]?.toString();
      
      spanishPapers.push({
        doi: item.DOI || item.doi,
        title: item.title[0],
        year,
        authors: formatAuthors(item.author),
        journal: item['container-title']?.[0] || 'Revista Científica de Tecnología',
      });
    }

    // Fallback/expansión para Español si no se completan los 6
    if (spanishPapers.length < 6) {
      const relaxedSpanishQuery = 'desarrollo software tecnologia';
      this.logger.log(`[CrossRef] Lote español incompleto (${spanishPapers.length}/6). Intentando expansión de búsqueda: "${relaxedSpanishQuery}"`);
      const backupItems = await fetchFromCrossRef(relaxedSpanishQuery, 50);
      
      for (const item of backupItems) {
        if (spanishPapers.length >= 6) break;
        if (!isValidPaper(item)) continue;
        
        const doi = (item.DOI || item.doi).trim().toLowerCase();
        const title = item.title[0].trim().toLowerCase();
        
        if (seenDOIs.has(doi) || seenTitles.has(title)) continue;
        
        seenDOIs.add(doi);
        seenTitles.add(title);
        
        const year = item.published?.['date-parts']?.[0]?.[0]?.toString() ||
                     item.issued?.['date-parts']?.[0]?.[0]?.toString() ||
                     item['published-print']?.['date-parts']?.[0]?.[0]?.toString();
        
        spanishPapers.push({
          doi: item.DOI || item.doi,
          title: item.title[0],
          year,
          authors: formatAuthors(item.author),
          journal: item['container-title']?.[0] || 'Revista Científica de Tecnología',
        });
      }
    }

    if (spanishPapers.length < 6) {
      throw new Error(`[CrossRef Error] No se pudo obtener el mínimo de 6 referencias válidas y únicas en español (se obtuvieron ${spanishPapers.length}).`);
    }

    const finalPapers = [...englishPapers, ...spanishPapers];
    this.logger.log(`[CrossRef] Total de referencias obtenidas: ${finalPapers.length} (24 inglesas / 6 españolas).`);
    return finalPapers;
  }
}
