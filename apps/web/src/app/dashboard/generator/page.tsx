'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  Sparkles,
  Heading,
  User,
  Users,
  Building,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Download,
  BookOpen
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Document, Paragraph, TextRun, AlignmentType, Packer, PageNumber, Footer, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

// Constante para guardar la imagen del logo UNT en formato Base64 (ej: 'data:image/png;base64,iVBORw5KGgo...')
// Si está vacía, no se renderizará ninguna imagen ni placeholder visual.
const UNT_LOGO_BASE64 = "";


interface ThesisResponse {
  success: boolean;
  message: string;
  thesisId: string;
  status: string;
}

interface ThesisData {
  id: string;
  title: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  structuredContent: {
    metadata: {
      title: string;
      author: string;
      advisor: string;
      lineOfResearch: string;
      campus: string;
      formatting: {
        fontFamily: string;
        fontSize: number;
        lineSpacing: number;
        margins: {
          left: string;
          top: string;
          right: string;
          bottom: string;
        };
      };
    };
    pages: Array<{
      pageNumber: number;
      type: string;
      title: string;
      content: any;
    }>;
  } | null;
  createdAt: string;
}

// Helper to format titles to Spanish sentence case, preserving common acronyms
function toSentenceCase(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length === 0) return '';

  const formattedWords = words.map((word, idx) => {
    if (idx === 0) {
      const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "");
      if (cleanWord === cleanWord.toUpperCase() && cleanWord.length >= 2) {
        return word; // Keep acronym
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "");
    // Check if acronym (all uppercase, length >= 2, e.g. "UNT", "IOT", "SQL")
    if (cleanWord === cleanWord.toUpperCase() && cleanWord.length >= 2 && !/^\d+$/.test(cleanWord)) {
      return word;
    }
    
    // Protect mixed casing (like "IoT")
    const isMixedCase = /[a-z]/.test(cleanWord) && /[A-Z]/.test(cleanWord);
    if (isMixedCase) {
      return word;
    }

    return word.toLowerCase();
  });

  return formattedWords.join(' ');
}

// Helper to format names to Title Case (capitalizing the first letter of each word)
function toTitleCase(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


// Helper to clean headers containing continuation annotations
function cleanPageTitle(title: any): string {
  if (!title) return '';
  let stringTitle = title;
  if (Array.isArray(stringTitle)) {
    stringTitle = stringTitle.join(' ');
  } else if (typeof stringTitle === 'object') {
    stringTitle = JSON.stringify(stringTitle);
  }
  stringTitle = String(stringTitle);
  return stringTitle
    .replace(/\s*\(?CONTINUACI[ÓOóo]\s*[Nn]\)?/gi, '')
    .trim();
}

// Helper to remove artificial page markers, repeated headings and isolated numbers
function cleanPageContent(text: any): string {
  if (!text) return '';

  let stringText = text;
  if (Array.isArray(stringText)) {
    stringText = stringText.join('\n');
  } else if (typeof stringText === 'object') {
    stringText = JSON.stringify(stringText, null, 2);
  }
  stringText = String(stringText);

  let lines: string[] = stringText.split('\n');

  // Filter out lines that are page markers, repeating headers, or isolated page numbers
  lines = lines.filter((line: string, index: number) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // Keep empty lines for spacing

    // 1. Check if the line is an artificial page marker (e.g. [PÁGINA 2], Página X, [Pág. 3])
    const isPageMarker = /^[\[(]?(?:P[ÁAáa]GINA|P[áa]g\.?)\s+\w+[\])]?$/i.test(trimmed);
    if (isPageMarker) return false;

    // 2. Check if the line is a repeating header with continuation label
    const isChapterHeader = /^(?:CAP[ÍIíi]TULO\s+\w+|MARCO\s+TE[ÓOóo]RICO|REFERENCIAS\s+BIBLIOGR[ÁAáa]FICAS).*/i.test(trimmed);
    const isContinuation = /CONTINUACI[ÓOóo]\s*[Nn]/i.test(trimmed);
    if (isChapterHeader && isContinuation) return false;
    
    // Check if the line is just a continuation marker on its own line
    if (/^\(?[cC][oO][nN][tT][iI][nN][uU][aA][cC][iI][óÓoO]\s*[nN]\)?$/i.test(trimmed)) return false;

    // 3. Check if the line is an isolated page number at the start or end of the page content
    const isIsolatedNumber = /^\d+$/.test(trimmed);
    if (isIsolatedNumber) {
      const isStart = index === 0 || lines.slice(0, index).every(l => !l.trim());
      const isEnd = index === lines.length - 1 || lines.slice(index + 1).every(l => !l.trim());
      if (isStart || isEnd) {
        return false;
      }
    }

    return true;
  });

  let cleaned = lines.join('\n');

  // Replace any inline occurrences of page numbers and continuations
  cleaned = cleaned.replace(/[\[(]?(?:P[ÁAáa]GINA|P[áa]g\.?)\s+\w+[\])]?/gi, '');
  cleaned = cleaned.replace(/\s*\(?CONTINUACI[ÓOóo]\s*[Nn]\)?/gi, '');

  return cleaned.trim();
}

// React component/function to parse and render clean preview text translating markdown bold and bullets
function renderCleanText(text: string): React.ReactNode {
  const cleanedText = cleanPageContent(text);
  const lines = cleanedText.split('\n');

  return lines.map((line, idx) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return <div key={idx} className="h-4" />;
    }

    // Check if list item
    const isBullet = /^\s*[\*\-]\s+(.*)/.test(line);
    const lineText = isBullet ? line.replace(/^\s*[\*\-]\s+/, '') : line;

    // Parse **bold** markers
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;

    while ((match = boldRegex.exec(lineText)) !== null) {
      if (match.index > lastIndex) {
        const normalPart = lineText.substring(lastIndex, match.index).replace(/\*/g, '');
        parts.push(normalPart);
      }
      const boldPart = match[1].replace(/\*/g, '');
      parts.push(
        <strong key={match.index} className="font-bold text-gray-900 dark:text-gray-100">
          {boldPart}
        </strong>
      );
      lastIndex = boldRegex.lastIndex;
    }

    if (lastIndex < lineText.length) {
      const normalPart = lineText.substring(lastIndex).replace(/\*/g, '');
      parts.push(normalPart);
    }

    if (isBullet) {
      return (
        <div key={idx} className="flex gap-2 pl-6 my-2 text-justify">
          <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">•</span>
          <span className="text-gray-800 dark:text-gray-200">{parts}</span>
        </div>
      );
    }

    return (
      <div key={idx} className="my-3 text-justify leading-relaxed text-gray-800 dark:text-gray-250">
        {parts}
      </div>
    );
  });
}

// Word document paragraph parser that supports inline bolding and bullets
function parseParagraphForDocx(paraText: string): Paragraph {
  const trimmed = paraText.trim();
  if (!trimmed) {
    return new Paragraph({ spacing: { after: 100 } });
  }

  const isBullet = /^\s*[\*\-]\s+(.*)/.test(trimmed);
  let contentText = isBullet ? trimmed.replace(/^\s*[\*\-]\s+/, '') : trimmed;

  // Pre-strip single asterisks that are not part of double asterisks
  contentText = contentText.replace(/\*(?!\*)/g, '');

  const parts = contentText.split('**');
  const children: TextRun[] = [];

  if (isBullet) {
    children.push(
      new TextRun({
        text: '•  ',
        font: 'Arial',
        size: 24, // 12pt
      })
    );
  }

  parts.forEach((part, index) => {
    const isBold = index % 2 === 1;
    const cleanPart = part.replace(/\*/g, '');
    if (cleanPart) {
      children.push(
        new TextRun({
          text: cleanPart,
          bold: isBold,
          font: 'Arial',
          size: 24, // 12pt
        })
      );
    }
  });

  return new Paragraph({
    alignment: isBullet ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 180 }, // 1.5 line spacing (360 dxa)
    indent: isBullet ? { left: 720 } : undefined, // 0.5 inches indentation
    children: children,
  });
}

export default function ThesisGeneratorPage() {
  // Form State
  const [title, setTitle] = useState('');
  const [lineOfResearch, setLineOfResearch] = useState('Gestión de Desarrollo de Software');
  const [campus, setCampus] = useState('Trujillo');
  const [authorName, setAuthorName] = useState('');
  const [author2Name, setAuthor2Name] = useState('');
  const [advisorName, setAdvisorName] = useState('');

  // Status and Progress States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thesisId, setThesisId] = useState<string | null>(null);
  const [thesisData, setThesisData] = useState<ThesisData | null>(null);
  const [polling, setPolling] = useState(false);

  // Preview States
  const [previewPage, setPreviewPage] = useState(0);

  // Dynamic Word Count Validation
  const words = title.trim().split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const isTitleInvalid = wordCount > 20;

  // Poll status from the backend resiliently
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (thesisId && polling) {
      intervalId = setInterval(async () => {
        try {
          const res = await apiClient<ThesisData>(`/generator/${thesisId}`);
          
          if (res && res.status) {
            setThesisData(res);
            
            if (res.status === 'COMPLETED' || res.status === 'FAILED') {
              setPolling(false);
              setLoading(false);
            }
          }
        } catch (err: any) {
          console.warn('Error silencioso en polling de estado de tesis (401/red/timeout) - Reintentando:', err.message);
        }
      }, 2500);
    }

    return () => clearInterval(intervalId);
  }, [thesisId, polling]);

  // Submit Handler
  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTitleInvalid || wordCount === 0) return;

    setLoading(true);
    setError(null);
    setThesisData(null);
    setThesisId(null);
    setPreviewPage(0);

    try {
      const finalAuthorName = author2Name.trim()
        ? `${authorName.trim()} y ${author2Name.trim()}`
        : authorName.trim();

      const response = await apiClient<ThesisResponse>('/generator/generate', {
        method: 'POST',
        body: JSON.stringify({
          title,
          lineOfResearch,
          campus,
          authorName: finalAuthorName,
          advisorName,
        }),
      });

      if (response.success && response.thesisId) {
        setThesisId(response.thesisId);
        setPolling(true);
        setThesisData({
          id: response.thesisId,
          title,
          status: 'PENDING',
          progress: 5,
          structuredContent: null,
          createdAt: new Date().toISOString(),
        });
      } else {
        throw new Error('No se pudo inicializar la generación en el servidor.');
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al enviar la solicitud al servidor.');
      setLoading(false);
    }
  };

  // Helper to determine status progress messages
  const getProgressMessage = (progress: number, status: string) => {
    if (status === 'FAILED') return 'La generación del borrador de tesis falló. Revisa la consola del backend.';
    if (status === 'PENDING') return 'Encolando tarea en BullMQ y preparando el worker...';
    if (progress <= 15) return 'Analizando y limpiando título de conectores y preposiciones...';
    if (progress <= 29) return 'Buscando 30 referencias académicas reales en inglés usando la API de CrossRef...';
    if (progress <= 49) return 'Llamada 1: Redactando Capítulo I (Introducción en prosa continua de más de 1500 palabras)...';
    if (progress <= 69) return 'Llamada 2: Generando la comparativa y análisis crítico de las 3 metodologías de desarrollo...';
    if (progress < 100) return 'Llamada 3: Estructurando el JSON final con tipografía Arial Narrow y márgenes oficiales...';
    return '¡Generación masiva del borrador completada con éxito!';
  };

  // 1. Export to PDF (jsPDF) with strict UNT styling, Jury Sheet, Índice, and continuous prose
  const handleDownloadPdf = () => {
    if (!thesisData?.structuredContent) return;
    const content = thesisData.structuredContent;

    // A4 dimensions in mm: 210 x 297
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const margins = {
      left: 30, // 3cm
      top: 25,  // 2.5cm
      right: 25, // 2.5cm
      bottom: 25, // 2.5cm
    };

    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - margins.left - margins.right;

    // PAGE 1: COVER (No page numbering)
    const cover = content.pages[0].content;
    
    let currentY = margins.top;
    const logoWidth = 35;
    const logoHeight = 35;
    const logoX = (pageWidth - logoWidth) / 2;

    if (UNT_LOGO_BASE64) {
      try {
        doc.addImage(UNT_LOGO_BASE64, 'PNG', logoX, currentY, logoWidth, logoHeight);
      } catch (err) {
        console.error("Error al cargar logo de UNT:", err);
      }
    }
    // Reservar el espacio del logo en blanco
    currentY += logoHeight + 10;

    // Encabezados Institucionales
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("UNIVERSIDAD NACIONAL DE TRUJILLO", pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;
    doc.text("FACULTAD DE INGENIERÍA", pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;
    doc.text("ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS", pageWidth / 2, currentY, { align: 'center' });
    currentY += 20;

    // Título de la Tesis
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    const titleLines = doc.splitTextToSize(toSentenceCase(cover.title), contentWidth);
    doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' });
    currentY += (titleLines.length * 6) + 6;

    // Proyecto de Tesis Subtitle
    doc.text("PROYECTO DE TESIS", pageWidth / 2, currentY, { align: 'center' });
    currentY += 20;

    // Metadatos (Autores y Asesores)
    const authors = cover.author
      .split(/,|\by\b/i)
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("AUTOR(ES)", 30, currentY);
    doc.text(":", 80, currentY);
    currentY += 7;
    doc.setFont('Helvetica', 'normal');
    authors.forEach((authorName: string, idx: number) => {
      doc.text(toTitleCase(authorName), 80, currentY + (idx * 6));
    });
    currentY += Math.max(6, authors.length * 6) + 4;

    doc.setFont('Helvetica', 'bold');
    doc.text("ASESOR", 30, currentY);
    doc.text(":", 80, currentY);
    currentY += 7;
    doc.setFont('Helvetica', 'normal');
    doc.text(toTitleCase(cover.advisor), 80, currentY);
    currentY += 10;

    doc.setFont('Helvetica', 'bold');
    doc.text("LÍNEA DE INVESTIGACIÓN", 30, currentY);
    doc.text(":", 80, currentY);
    currentY += 7;
    doc.setFont('Helvetica', 'normal');
    const lineLines = doc.splitTextToSize(toSentenceCase(content.metadata.lineOfResearch), pageWidth - 80 - margins.right);
    doc.text(lineLines, 80, currentY);

    // Pie de Carátula
    currentY = pageHeight - margins.bottom - 10;
    doc.setFont('Helvetica', 'bold');
    doc.text("GUADALUPE - PERÚ", pageWidth / 2, currentY, { align: 'center' });
    currentY += 6;
    doc.text(String(cover.year), pageWidth / 2, currentY, { align: 'center' });

    let pageNum = 1;

    // PAGE 2: JURADO DICTAMINADOR (Approval Sheet)
    doc.addPage();
    pageNum++;
    let juryY = margins.top;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('JURADO DICTAMINADOR', pageWidth / 2, juryY, { align: 'center' });
    juryY += 15;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(12);
    const juryIntro = `El presente proyecto de tesis titulado "${toSentenceCase(cover.title)}", presentado por el bachiller ${toTitleCase(cover.author)}, ha sido evaluado y aprobado por el siguiente jurado dictaminador para optar el título profesional de Ingeniero de Sistemas.`;
    const juryIntroLines = doc.splitTextToSize(juryIntro, contentWidth);
    doc.text(juryIntroLines, margins.left, juryY, { align: 'justify', maxWidth: contentWidth });
    juryY += (juryIntroLines.length * 7.5) + 30;

    // President
    doc.line(pageWidth / 2 - 40, juryY, pageWidth / 2 + 40, juryY);
    juryY += 6;
    doc.setFont('Helvetica', 'bold');
    doc.text('PRESIDENTE', pageWidth / 2, juryY, { align: 'center' });
    juryY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('(Docente General)', pageWidth / 2, juryY, { align: 'center' });
    juryY += 25;

    // Secretary
    doc.line(pageWidth / 2 - 40, juryY, pageWidth / 2 + 40, juryY);
    juryY += 6;
    doc.setFont('Helvetica', 'bold');
    doc.text('SECRETARIO', pageWidth / 2, juryY, { align: 'center' });
    juryY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('(Docente Metodólogo)', pageWidth / 2, juryY, { align: 'center' });
    juryY += 25;

    // Vocal
    doc.line(pageWidth / 2 - 40, juryY, pageWidth / 2 + 40, juryY);
    juryY += 6;
    doc.setFont('Helvetica', 'bold');
    doc.text('VOCAL', pageWidth / 2, juryY, { align: 'center' });
    juryY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('(Asesor)', pageWidth / 2, juryY, { align: 'center' });

    // Page number for Jury Page
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(pageNum), pageWidth - margins.right, pageHeight - 15, { align: 'right' });

    // PAGE 3: ÍNDICE GENERAL (Placeholder to render dynamically at the end)
    doc.addPage();
    pageNum++;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('ÍNDICE GENERAL', pageWidth / 2, margins.top, { align: 'center' });

    // Page number for Index Page
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(pageNum), pageWidth - margins.right, pageHeight - 15, { align: 'right' });

    // Group pages 2-10 by type to ensure continuous prose
    const sections: Array<{
      type: string;
      title: string;
      content: string;
    }> = [];

    content.pages.forEach((page, index) => {
      if (index === 0) return; // Skip cover
      if (page.type === 'annex') return; // Skip annexes

      const cleanTitle = cleanPageTitle(page.title);
      const cleanContent = cleanPageContent(page.content);

      const existingSection = sections.find((s) => s.type === page.type);
      if (existingSection) {
        existingSection.content += '\n' + cleanContent;
      } else {
        sections.push({
          type: page.type,
          title: cleanTitle,
          content: cleanContent,
        });
      }
    });

    // Dynamic start page indices for TOC
    let introStartPage = 0;
    let methodologyStartPage = 0;
    let referencesStartPage = 0;
    const annexStartPages: Record<string, number> = {};

    // PAGES 4+: Render sections dynamically
    sections.forEach((section) => {
      doc.addPage();
      pageNum++;

      // Track the page index of the section's start page
      if (section.type === 'introduction' && introStartPage === 0) {
        introStartPage = pageNum;
      } else if (section.type === 'methodology' && methodologyStartPage === 0) {
        methodologyStartPage = pageNum;
      } else if (section.type === 'references' && referencesStartPage === 0) {
        referencesStartPage = pageNum;
      } else if (section.type === 'annex') {
        annexStartPages[section.title] = pageNum;
      }

      // Section Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      let y = margins.top;
      doc.text(section.title.toUpperCase(), margins.left, y);
      y += 12;

      // Text body
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(12);
      
      const paragraphs = section.content.split('\n');
      paragraphs.forEach((para: string) => {
        const trimmed = para.trim();
        if (!trimmed) {
          y += 5; // Empty line spacing
          return;
        }

        // Check if paragraph is bold (e.g. subheadings wrapped in **)
        const isBoldPara = trimmed.startsWith('**') && trimmed.endsWith('**');

        // Clean markdown formatting characters
        let textToPrint = trimmed
          .replace(/^\s*[\*\-]\s+/g, '• ') // Replace bullets with •
          .replace(/\*/g, ''); // Remove all other asterisks

        // Set font style
        if (isBoldPara) {
          doc.setFont('Helvetica', 'bold');
        } else {
          doc.setFont('Helvetica', 'normal');
        }

        const lines = doc.splitTextToSize(textToPrint, contentWidth);
        lines.forEach((line: string) => {
          if (y > pageHeight - margins.bottom - 10) {
            // Draw page number before leaving the page
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(String(pageNum), pageWidth - margins.right, pageHeight - 15, { align: 'right' });

            doc.addPage();
            pageNum++;
            
            // Restore font style on new page
            if (isBoldPara) {
              doc.setFont('Helvetica', 'bold');
            } else {
              doc.setFont('Helvetica', 'normal');
            }
            doc.setFontSize(12);
            y = margins.top;
          }

          // Full justification simulator
          doc.text(line, margins.left, y, { align: 'justify', maxWidth: contentWidth });
          y += 7.5; // Simulated 1.5 line spacing (11pt font * 1.5 ~ 5.5mm + padding ~ 7.5mm)
        });
        
        doc.setFont('Helvetica', 'normal');
        y += 4; // Spacing between paragraphs
      });

      // Page number in Arabic format in the bottom right corner
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(String(pageNum), pageWidth - margins.right, pageHeight - 15, { align: 'right' });
    });

    // TWO-PASS TOC GENERATION: Draw table of contents on Page 3
    doc.setPage(3);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(12);
    let indexY = margins.top + 20;

    const indexItems = [
      { name: 'CARÁTULA', page: 'I' },
      { name: 'JURADO DICTAMINADOR', page: '2' },
      { name: 'ÍNDICE GENERAL', page: '3' },
      { name: 'CAPÍTULO I: INTRODUCCIÓN', page: String(introStartPage) },
      { name: 'MARCO TEÓRICO: COMPARATIVA DE METODOLOGÍAS', page: String(methodologyStartPage) },
      { name: 'REFERENCIAS BIBLIOGRÁFICAS', page: String(referencesStartPage) },
    ];

    sections.forEach((sect) => {
      if (sect.type === 'annex') {
        indexItems.push({
          name: sect.title.toUpperCase(),
          page: String(annexStartPages[sect.title] || ''),
        });
      }
    });

    indexItems.forEach((item) => {
      doc.setFont('Helvetica', 'normal');
      doc.text(item.name, margins.left, indexY);
      doc.text(item.page, pageWidth - margins.right, indexY, { align: 'right' });
      
      // Draw dots dynamically
      const nameWidth = doc.getTextWidth(item.name);
      const pageNumWidth = doc.getTextWidth(item.page);
      const startX = margins.left + nameWidth + 2;
      const endX = pageWidth - margins.right - pageNumWidth - 2;
      const dotsWidth = endX - startX;
      if (dotsWidth > 0) {
        const dotCharWidth = doc.getTextWidth('.');
        const dotCount = Math.floor(dotsWidth / dotCharWidth);
        const dotsText = '.'.repeat(dotCount);
        doc.text(dotsText, startX, indexY);
      }
      indexY += 10;
    });

    doc.save(`Proyecto_Tesis_Oficial_UNT_${thesisData.id.slice(0, 8)}.pdf`);
  };

  // 2. Export to Word (.docx) with UNT styling, Jury Sheet, Índice, and continuous prose
  const handleDownloadDocx = async () => {
    if (!thesisData?.structuredContent) return;
    const content = thesisData.structuredContent;

    // Convert margins to dxa (1mm = 56.7 dxa)
    // Left: 30mm = 1701 dxa. Top, Bottom, Right: 25mm = 1418 dxa.
    const standardSection = (children: (Paragraph | Table)[], hasPageNumber: boolean) => ({
      properties: {
        page: {
          margin: {
            top: 1418,
            bottom: 1418,
            left: 1701,
            right: 1418,
          },
        },
      },
      footers: hasPageNumber
        ? {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: 'Arial',
                      size: 20, // 10pt
                    }),
                  ],
                }),
              ],
            }),
          }
        : undefined,
      children,
    });

    const coverInfo = content.pages[0].content;

    const authors = coverInfo.author
      .split(/,|\by\b/i)
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0);

    const borderlessBorders = {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    const metadataTable = new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: borderlessBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: borderlessBorders,
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: "AUTOR(ES)",
                      bold: true,
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 65, type: WidthType.PERCENTAGE },
              borders: borderlessBorders,
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: ":",
                      bold: true,
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
                ...authors.map((authorName: string) => new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: toTitleCase(authorName),
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                })),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: borderlessBorders,
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: "ASESOR",
                      bold: true,
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 65, type: WidthType.PERCENTAGE },
              borders: borderlessBorders,
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: ":",
                      bold: true,
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: toTitleCase(coverInfo.advisor),
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: borderlessBorders,
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: "LÍNEA DE INVESTIGACIÓN",
                      bold: true,
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 65, type: WidthType.PERCENTAGE },
              borders: borderlessBorders,
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: ":",
                      bold: true,
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({
                      text: toSentenceCase(content.metadata.lineOfResearch),
                      font: 'Arial',
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // Group pages 2-10 by type to ensure continuous prose
    const sections: Array<{
      type: string;
      title: string;
      content: string;
    }> = [];

    content.pages.forEach((page, index) => {
      if (index === 0) return; // Skip cover
      if (page.type === 'annex') return; // Skip annexes

      const cleanTitle = cleanPageTitle(page.title);
      const cleanContent = cleanPageContent(page.content);

      const existingSection = sections.find((s) => s.type === page.type);
      if (existingSection) {
        existingSection.content += '\n' + cleanContent;
      } else {
        sections.push({
          type: page.type,
          title: cleanTitle,
          content: cleanContent,
        });
      }
    });

    const doc = new Document({
      sections: [
        // COVER PAGE SECTION
        standardSection(
          [
            // Logo space
            ...(UNT_LOGO_BASE64
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 200 },
                    children: [
                      new ImageRun({
                        data: Uint8Array.from(atob(UNT_LOGO_BASE64), (c) => c.charCodeAt(0)),
                        type: 'png',
                        transformation: {
                          width: 100,
                          height: 100,
                        },
                      }),
                    ],
                  }),
                ]
              : [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 800 }, // Reservamos espacio en blanco
                    children: [],
                  }),
                ]),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 100 },
              children: [
                new TextRun({
                  text: coverInfo.institution.toUpperCase(),
                  bold: true,
                  font: 'Arial',
                  size: 28, // 14pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: coverInfo.faculty.toUpperCase(),
                  bold: true,
                  font: 'Arial',
                  size: 28, // 14pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 1000 },
              children: [
                new TextRun({
                  text: coverInfo.school.toUpperCase(),
                  bold: true,
                  font: 'Arial',
                  size: 28, // 14pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 150 },
              children: [
                new TextRun({
                  text: toSentenceCase(coverInfo.title),
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 1200 },
              children: [
                new TextRun({
                  text: "PROYECTO DE TESIS",
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            metadataTable,
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 1200, after: 100 },
              children: [
                new TextRun({
                  text: "GUADALUPE - PERÚ",
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: String(coverInfo.year),
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
          ],
          false // No page numbering for cover
        ),
        // JURADO DICTAMINADOR SECTION
        standardSection(
          [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 400 },
              children: [
                new TextRun({
                  text: 'JURADO DICTAMINADOR',
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, after: 800 },
              children: [
                new TextRun({
                  text: `El presente proyecto de tesis titulado "${toSentenceCase(coverInfo.title)}", presentado por el bachiller ${toTitleCase(coverInfo.author)}, ha sido evaluado y aprobado por el siguiente jurado dictaminador para optar el título profesional de Ingeniero de Sistemas.`,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            // President
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 600, after: 100 },
              children: [
                new TextRun({
                  text: '_____________________________________',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 50 },
              children: [
                new TextRun({
                  text: 'PRESIDENTE',
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 800 },
              children: [
                new TextRun({
                  text: '(Docente General)',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            // Secretary
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: '_____________________________________',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 50 },
              children: [
                new TextRun({
                  text: 'SECRETARIO',
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 800 },
              children: [
                new TextRun({
                  text: '(Docente Metodólogo)',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            // Vocal
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: '_____________________________________',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 50 },
              children: [
                new TextRun({
                  text: 'VOCAL',
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: '(Asesor)',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
          ],
          true
        ),
        // ÍNDICE GENERAL SECTION
        standardSection(
          [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 400 },
              children: [
                new TextRun({
                  text: 'ÍNDICE GENERAL',
                  bold: true,
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'CARÁTULA........................................................................................................... I',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'JURADO DICTAMINADOR.................................................................................... II',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'ÍNDICE GENERAL................................................................................................... III',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'CAPÍTULO I: INTRODUCCIÓN............................................................................ IV',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'MARCO TEÓRICO: COMPARATIVA DE METODOLOGÍAS............................ V',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'REFERENCIAS BIBLIOGRÁFICAS...................................................................... VI',
                  font: 'Arial',
                  size: 24, // 12pt
                }),
              ],
            }),

          ],
          true
        ),
        // CONTENT SECTIONS (Pages 4+, grouped as continuous prose chapters)
        ...sections.map((section) =>
          standardSection(
            [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 200, after: 300 },
                children: [
                  new TextRun({
                    text: section.title.toUpperCase(),
                    bold: true,
                    font: 'Arial',
                    size: 24, // 12pt
                  }),
                ],
              }),
              ...section.content.split('\n').map((para: string) => parseParagraphForDocx(para)),
            ],
            true // Enable page numbering starting from page 2
          )
        ),
      ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Proyecto_Tesis_Oficial_UNT_${thesisData.id.slice(0, 8)}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary-500 animate-pulse" />
          Generador Automático de Tesis (UNT)
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Crea borradores de proyectos de tesis de 10 páginas alineados con el <b>EsquemaPT</b> de la Universidad Nacional de Trujillo.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Left Form: Inputs Panel */}
        <div className="xl:col-span-5 space-y-6">
          <div className="glass-card p-6 shadow-xl relative border border-white/10">
            <div className="border-b border-surface-200 dark:border-surface-700 pb-3 mb-5">
              <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-500" />
                Parámetros de Tesis
              </h3>
              <p className="text-xs text-gray-450 mt-0.5">
                Valores obligatorios para la inyección de normativas y búsqueda científica.
              </p>
            </div>

            <form onSubmit={handleStartGeneration} className="space-y-5">
              {/* Título de la Tesis */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Heading className="w-4 h-4 text-primary-400" />
                    Título de la Propuesta de Tesis
                  </label>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isTitleInvalid
                        ? 'bg-red-500/20 text-red-500'
                        : wordCount > 0
                        ? 'bg-emerald-500/20 text-emerald-500'
                        : 'bg-gray-500/20 text-gray-500'
                    }`}
                  >
                    {wordCount} / 20 palabras
                  </span>
                </div>
                <textarea
                  rows={3}
                  className={`input-field resize-none focus:ring-2 ${
                    isTitleInvalid ? 'border-red-500 focus:ring-red-500/20' : 'focus:ring-primary-500/20'
                  }`}
                  placeholder="Ej. Sistema IoT para el monitoreo en tiempo real del consumo de energía eléctrica en el campus Trujillo de la UNT"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  required
                />
                {isTitleInvalid && (
                  <p className="text-xs text-red-500 font-medium">
                    ⚠️ El título excede las 20 palabras permitidas en las directrices de la UNT.
                  </p>
                )}
              </div>

              {/* Línea de Investigación */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-primary-400" />
                  Línea de Investigación (Oficial UNT)
                </label>
                <select
                  className="input-field"
                  value={lineOfResearch}
                  onChange={(e) => setLineOfResearch(e.target.value)}
                  disabled={loading}
                >
                  <option value="Gestión de Gobierno y Servicios de TIC">Gestión de Gobierno y Servicios de TIC</option>
                  <option value="Gestión de Proyectos de TIC">Gestión de Proyectos de TIC</option>
                  <option value="Gestión de Desarrollo de Software">Gestión de Desarrollo de Software</option>
                  <option value="Gestión de Infraestructura y Comunicaciones">Gestión de Infraestructura y Comunicaciones</option>
                  <option value="Gestión de la Seguridad de la Información">Gestión de la Seguridad de la Información</option>
                </select>
              </div>

              {/* Sede / Campus */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-primary-400" />
                  Sede / Campus
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 p-3 rounded-lg border border-surface-200 dark:border-surface-700 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-850">
                    <input
                      type="radio"
                      name="campus"
                      value="Trujillo"
                      checked={campus === 'Trujillo'}
                      onChange={() => setCampus('Trujillo')}
                      disabled={loading}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium">Trujillo</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 rounded-lg border border-surface-200 dark:border-surface-700 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-850">
                    <input
                      type="radio"
                      name="campus"
                      value="Guadalupe"
                      checked={campus === 'Guadalupe'}
                      onChange={() => setCampus('Guadalupe')}
                      disabled={loading}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium">Guadalupe</span>
                  </label>
                </div>
              </div>

              {/* Nombres del Autor */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-primary-400" />
                  Autor 1 (Nombres y Apellidos)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. Juan Pérez Gómez"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              {/* Nombres del Autor 2 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-primary-400" />
                  Autor 2 (Nombres y Apellidos - Opcional)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. María López Flores (Opcional)"
                  value={author2Name}
                  onChange={(e) => setAuthor2Name(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* Nombres del Asesor */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary-400" />
                  Asesor Académico
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. Dr. Carlos Rodríguez Ruiz"
                  value={advisorName}
                  onChange={(e) => setAdvisorName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm flex gap-2">
                  <XCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || isTitleInvalid || wordCount === 0}
                className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 font-bold text-base transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                     <Loader2 className="w-5 h-5 animate-spin" />
                     Procesando masivamente...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Comenzar Generación Masiva
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Status & Realtime Progress Panel */}
        <div className="xl:col-span-7 space-y-6">
          
          {/* Progress / Status Panel */}
          {thesisData ? (
            <div className="glass-card p-6 shadow-xl space-y-6 border border-white/10">
              <div className="flex justify-between items-center border-b border-surface-200 dark:border-surface-700 pb-3">
                <div>
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">
                    Monitoreo en Tiempo Real
                  </h3>
                  <p className="text-xs text-gray-450">
                    Procesando tareas pesadas mediante BullMQ y LLMs.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400">Estado:</span>
                  <span
                    className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                      thesisData.status === 'COMPLETED'
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : thesisData.status === 'FAILED'
                        ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                        : 'bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse'
                    }`}
                  >
                    {thesisData.status}
                  </span>
                </div>
              </div>

              {/* Progress Bar & Stage description */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-gray-600 dark:text-gray-300">Progreso de Generación</span>
                  <span className="text-primary-500 font-bold">{thesisData.progress}%</span>
                </div>
                
                {/* Progress bar line */}
                <div className="w-full h-3 bg-surface-200 dark:bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ease-out rounded-full ${
                      thesisData.status === 'FAILED'
                        ? 'bg-red-500'
                        : thesisData.status === 'COMPLETED'
                        ? 'bg-emerald-500'
                        : 'bg-gradient-to-r from-primary-600 to-primary-400'
                    }`}
                    style={{ width: `${thesisData.progress}%` }}
                  />
                </div>

                {/* Subtitle helper showing current stage */}
                <div className="flex gap-3 items-start p-4 bg-surface-50 dark:bg-surface-850 rounded-xl border border-surface-200 dark:border-surface-750">
                  {thesisData.status === 'COMPLETED' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : thesisData.status === 'FAILED' ? (
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-primary-500 animate-spin flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h5 className="font-bold text-sm">Etapa Actual</h5>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {getProgressMessage(thesisData.progress, thesisData.status)}
                    </p>
                  </div>
                </div>
              </div>

              {/* COMPLETED Actions & A4 Page Preview */}
              {thesisData.status === 'COMPLETED' && thesisData.structuredContent && (
                <div className="space-y-6 pt-4 border-t border-surface-200 dark:border-surface-700">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <h4 className="font-bold text-base text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      Descargas del Borrador (Esquema UNT)
                    </h4>
                    
                    {/* Action buttons */}
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        className="flex-1 sm:flex-initial btn-primary py-2.5 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1.5 text-white"
                      >
                        <Download className="w-4 h-4" />
                        Descargar PDF Oficial
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadDocx}
                        className="flex-1 sm:flex-initial btn-primary py-2.5 px-4 text-xs font-bold bg-indigo-600 hover:bg-indigo-750 flex items-center justify-center gap-1.5 text-white"
                      >
                        <FileText className="w-4 h-4" />
                        Descargar Word (.docx)
                      </button>
                    </div>
                  </div>

                  {/* Interactive A4 Page Visualizer */}
                  <div className="space-y-4">
                    {/* Pagination Controls */}
                    <div className="flex justify-between items-center bg-surface-50 dark:bg-surface-850 p-2.5 rounded-xl border border-surface-200 dark:border-surface-750">
                      <button
                        type="button"
                        onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                        disabled={previewPage === 0}
                        className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-750 transition-colors disabled:opacity-30 text-gray-700 dark:text-gray-300"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                        Página {previewPage + 1} de {thesisData.structuredContent.pages.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewPage((p) => Math.min(thesisData.structuredContent!.pages.length - 1, p + 1))}
                        disabled={previewPage === thesisData.structuredContent.pages.length - 1}
                        className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-750 transition-colors disabled:opacity-30 text-gray-700 dark:text-gray-300"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* A4 Sheet Container */}
                    <div className="bg-surface-200 dark:bg-surface-900 p-6 rounded-xl border border-surface-300 dark:border-surface-800 overflow-x-auto flex justify-center">
                      <div
                        className="bg-white text-black border border-gray-300 shadow-2xl relative select-text text-justify"
                        style={{
                          width: '100%',
                          maxWidth: '650px',
                          minHeight: '840px',
                          fontFamily: 'Arial, sans-serif',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          paddingLeft: '3.0cm',
                          paddingTop: '2.5cm',
                          paddingRight: '2.5cm',
                          paddingBottom: '2.5cm',
                          boxSizing: 'border-box',
                        }}
                      >
                        {/* Page Number (bottom right corner except cover) */}
                        {previewPage > 0 && (
                          <div className="absolute bottom-[1.2cm] right-[2.5cm] text-xs font-semibold text-gray-500">
                            {previewPage + 1}
                          </div>
                        )}

                        {/* Page content switcher */}
                        {thesisData.structuredContent.pages[previewPage].type === 'cover' ? (
                          // Render Cover Page (UNT standard)
                          <div className="h-full flex flex-col justify-between text-center items-center font-sans tracking-wide">
                            <div className="space-y-1 font-bold text-sm">
                              <h4>{thesisData.structuredContent.pages[previewPage].content.institution}</h4>
                              <h5>{thesisData.structuredContent.pages[previewPage].content.faculty}</h5>
                              <h6>{thesisData.structuredContent.pages[previewPage].content.school}</h6>
                            </div>

                            <div className="w-16 h-0.5 bg-black my-8" />

                            <div className="my-10 font-bold text-base uppercase leading-snug max-w-[90%] text-center">
                              {toSentenceCase(thesisData.structuredContent.pages[previewPage].content.title)}
                            </div>

                            <div className="mt-auto w-full pl-5 pr-5">
                              <table className="w-full text-left border-collapse text-xs table-fixed">
                                <tbody>
                                  <tr className="align-top">
                                    <td className="w-[35%] font-bold py-1.5 uppercase">Autor(es)</td>
                                    <td className="w-[5%] font-bold py-1.5">:</td>
                                    <td className="w-[60%] py-1.5">
                                      {thesisData.structuredContent.pages[previewPage].content.author
                                        .split(/,|\by\b/i)
                                        .map((a: string) => toTitleCase(a.trim()))
                                        .join(', ')}
                                    </td>
                                  </tr>
                                  <tr className="align-top">
                                    <td className="font-bold py-1.5 uppercase">Asesor</td>
                                    <td className="font-bold py-1.5">:</td>
                                    <td className="py-1.5">
                                      {toTitleCase(thesisData.structuredContent.pages[previewPage].content.advisor)}
                                    </td>
                                  </tr>
                                  <tr className="align-top">
                                    <td className="font-bold py-1.5 uppercase">Línea de Investigación</td>
                                    <td className="font-bold py-1.5">:</td>
                                    <td className="py-1.5">
                                      {toSentenceCase(thesisData.structuredContent?.metadata?.lineOfResearch || '')}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            <div className="mt-20 font-bold text-xs uppercase tracking-widest text-center">
                              Trujillo, Perú — {thesisData.structuredContent.pages[previewPage].content.year}
                            </div>
                          </div>
                        ) : (
                          // Render standard content page (Continuous prose Chapter I, methodologies, references, or annexes)
                          <div className="space-y-6">
                            {/* Page Header Title */}
                            <div className="border-b border-gray-150 pb-2 mb-4">
                              <h3 className="font-bold text-sm uppercase tracking-wide text-gray-800">
                                {cleanPageTitle(thesisData.structuredContent.pages[previewPage].title)}
                              </h3>
                            </div>

                            {/* Text body */}
                            <div className="leading-relaxed text-sm text-gray-900 font-sans">
                              {renderCleanText(thesisData.structuredContent.pages[previewPage].content)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Empty State
            <div className="glass-card p-12 text-center border-2 border-dashed border-surface-300 dark:border-surface-700 flex flex-col items-center justify-center min-h-[480px]">
              <div className="w-16 h-16 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-lg text-gray-800 dark:text-gray-250">
                Ninguna tarea en ejecución
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mt-2 leading-relaxed">
                Rellena el formulario académico de la izquierda con la propuesta de investigación y presiona <b>Comenzar Generación Masiva</b> para arrancar el encolamiento asíncrono.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
