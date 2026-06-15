import PDFDocument from 'pdfkit';

export interface PDFReportData {
  title: string;
  studentName: string;
  advisorName: string;
  campus: string;
  submittedAt: Date;
  overallScore: number | null;
  findings: Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    instruction: string;
    affectedSection?: string | null;
    pageNumber?: number | null;
  }>;
  citations: Array<{
    rawCitation: string;
    status: string;
    matchScore: number | null;
    crossrefTitle?: string | null;
  }>;
  plagiarism: Array<{
    similarityScore: number;
    matchedFileName?: string | null;
  }>;
}

export function generateReviewPDF(data: PDFReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Colors
      const primaryColor = '#1E3A8A'; // Dark Blue
      const secondaryColor = '#475569'; // slate grey
      const darkColor = '#0F172A'; // dark slate
      const lightBg = '#F8FAFC'; // light slate bg
      
      const severityColors: Record<string, string> = {
        CRITICAL: '#DC2626', // Red
        MAJOR: '#EA580C', // Orange
        MINOR: '#D97706', // Amber
        INFO: '#2563EB', // Blue
      };

      // Header Banner
      doc.rect(0, 0, 595.28, 120).fill(primaryColor);
      
      // Title inside Banner
      doc.fillColor('#FFFFFF')
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('REVISOR DE TESIS IA', 50, 40)
         .fontSize(12)
         .font('Helvetica')
         .text('Reporte Detallado de Retroalimentación y Observaciones', 50, 70);

      // Metadata Section
      doc.y = 150;
      doc.fillColor(darkColor);

      doc.fontSize(16).font('Helvetica-Bold').text('Información del Proyecto', 50, doc.y);
      doc.moveDown(0.5);

      // Metadata box
      const startY = doc.y;
      doc.rect(50, startY, 495, 130).fill(lightBg);
      
      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold');
      
      // Write metadata fields
      doc.text('Título:', 65, startY + 15).font('Helvetica').text(data.title, 150, startY + 15, { width: 380 });
      
      const currentY = doc.y + 8;
      doc.font('Helvetica-Bold').text('Estudiante:', 65, currentY).font('Helvetica').text(data.studentName, 150, currentY);
      doc.font('Helvetica-Bold').text('Asesor:', 65, currentY + 18).font('Helvetica').text(data.advisorName, 150, currentY + 18);
      doc.font('Helvetica-Bold').text('Sede/Campus:', 65, currentY + 36).font('Helvetica').text(data.campus || 'No especificado', 150, currentY + 36);
      doc.font('Helvetica-Bold').text('Fecha de Envío:', 65, currentY + 54).font('Helvetica').text(new Date(data.submittedAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }), 150, currentY + 54);

      // Overall Score box in the metadata area
      const scoreX = 430;
      const scoreY = currentY;
      doc.rect(scoreX, scoreY, 95, 65).fill(primaryColor);
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text('NOTA SUGERIDA', scoreX + 8, scoreY + 12, { align: 'center', width: 80 });
      const displayScore = data.overallScore !== null ? data.overallScore.toFixed(1) : '--';
      doc.fontSize(24).font('Helvetica-Bold').text(displayScore, scoreX + 8, scoreY + 28, { align: 'center', width: 80 });

      // Findings Summary statistics
      doc.y = startY + 160;
      doc.fillColor(darkColor).fontSize(16).font('Helvetica-Bold').text('Resumen de Observaciones', 50, doc.y);
      doc.moveDown(0.5);

      const criticalCount = data.findings.filter(f => f.severity === 'CRITICAL').length;
      const majorCount = data.findings.filter(f => f.severity === 'MAJOR').length;
      const minorCount = data.findings.filter(f => f.severity === 'MINOR').length;
      const infoCount = data.findings.filter(f => f.severity === 'INFO').length;

      // Draw metric boxes
      const boxW = 105;
      const boxH = 50;
      const gap = 25;
      
      const drawMetricBox = (x: number, label: string, count: number, color: string) => {
        doc.rect(x, doc.y, boxW, boxH).fill(lightBg);
        doc.rect(x, doc.y, 4, boxH).fill(color);
        doc.fillColor(darkColor).fontSize(16).font('Helvetica-Bold').text(String(count), x + 15, doc.y + 10);
        doc.fillColor(secondaryColor).fontSize(9).font('Helvetica-Bold').text(label, x + 15, doc.y + 30);
      };

      drawMetricBox(50, 'CRÍTICAS', criticalCount, severityColors.CRITICAL);
      drawMetricBox(50 + boxW + gap, 'MAYORES', majorCount, severityColors.MAJOR);
      drawMetricBox(50 + (boxW + gap) * 2, 'MENORES', minorCount, severityColors.MINOR);
      drawMetricBox(50 + (boxW + gap) * 3, 'INFORMATIVAS', infoCount, severityColors.INFO);

      // Section Plagiarism and Citations Summary
      doc.y += boxH + 30;
      doc.fillColor(darkColor).fontSize(14).font('Helvetica-Bold').text('Plagio y Citas Bibliográficas', 50, doc.y);
      doc.moveDown(0.5);
      
      const plagY = doc.y;
      doc.rect(50, plagY, 235, 60).fill(lightBg);
      const maxPlag = data.plagiarism.length > 0 ? Math.max(...data.plagiarism.map(p => p.similarityScore)) * 100 : 0;
      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('Índice de Similitud (Plagio):', 60, plagY + 15);
      doc.fillColor(maxPlag > 20 ? severityColors.CRITICAL : primaryColor).fontSize(16).font('Helvetica-Bold').text(`${maxPlag.toFixed(1)}%`, 60, plagY + 30);

      doc.rect(310, plagY, 235, 60).fill(lightBg);
      const verifiedCits = data.citations.filter(c => c.status === 'VERIFIED').length;
      const totalCits = data.citations.length;
      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('Citas Bibliográficas:', 320, plagY + 15);
      doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold').text(`${verifiedCits} / ${totalCits} Verificadas`, 320, plagY + 30);

      // Page Break for Detailed Findings
      doc.addPage();
      
      // Header for other pages
      const addPageHeader = (pageNumber: number) => {
        doc.rect(0, 0, 595.28, 40).fill(primaryColor);
        doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text('REVISOR DE TESIS IA — DETALLE DE OBSERVACIONES', 50, 15);
      };
      
      let pageNum = 2;
      addPageHeader(pageNum);
      
      doc.y = 70;
      doc.fillColor(darkColor).fontSize(16).font('Helvetica-Bold').text('Listado Detallado de Hallazgos', 50, doc.y);
      doc.moveDown(0.5);

      if (data.findings.length === 0) {
        doc.fontSize(11).font('Helvetica').text('No se encontraron observaciones en el documento de tesis.', 50, doc.y);
      } else {
        // Sort findings: CRITICAL -> MAJOR -> MINOR -> INFO
        const severityOrder: Record<string, number> = { CRITICAL: 0, MAJOR: 1, MINOR: 2, INFO: 3 };
        const sortedFindings = [...data.findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        for (const finding of sortedFindings) {
          // Check if space remains on page, else add page
          if (doc.y > 670) {
            doc.addPage();
            pageNum++;
            addPageHeader(pageNum);
            doc.y = 70;
          }

          const fColor = severityColors[finding.severity] || primaryColor;
          
          doc.rect(50, doc.y, 495, 20).fill(lightBg);
          doc.rect(50, doc.y, 4, 20).fill(fColor);
          
          doc.fillColor(fColor).fontSize(9).font('Helvetica-Bold').text(finding.severity, 60, doc.y + 6);
          doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text(`${finding.title}`, 130, doc.y + 5, { width: 330, ellipsis: true });
          
          const pageStr = finding.pageNumber ? `Pág. ${finding.pageNumber}` : '';
          const secStr = finding.affectedSection ? finding.affectedSection : '';
          const locStr = [secStr, pageStr].filter(Boolean).join(' - ');
          if (locStr) {
            doc.fillColor(secondaryColor).fontSize(8).font('Helvetica-Bold').text(locStr, 440, doc.y + 6, { align: 'right', width: 95 });
          }

          doc.y += 25;
          doc.fillColor(darkColor).fontSize(9.5).font('Helvetica-Bold').text('Descripción:', 65, doc.y);
          doc.font('Helvetica').text(finding.description, 140, doc.y, { width: 390 });
          
          doc.y = doc.y + doc.heightOfString(finding.description, { width: 390 }) + 6;
          doc.fillColor(primaryColor).fontSize(9.5).font('Helvetica-Bold').text('Instrucción:', 65, doc.y);
          doc.font('Helvetica-Oblique').text(finding.instruction, 140, doc.y, { width: 390 });
          
          doc.y = doc.y + doc.heightOfString(finding.instruction, { width: 390 }) + 15;
          
          // Divider line
          doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.y += 10;
        }
      }

      // Add Citations Page if any citations are present
      if (data.citations.length > 0) {
        if (doc.y > 550) {
          doc.addPage();
          pageNum++;
          addPageHeader(pageNum);
          doc.y = 70;
        } else {
          doc.y += 15;
        }

        doc.fillColor(darkColor).fontSize(14).font('Helvetica-Bold').text('Validación de Referencias Bibliográficas (CrossRef)', 50, doc.y);
        doc.moveDown(0.5);

        for (const citation of data.citations.slice(0, 15)) { // Limit to top 15 for space
          if (doc.y > 700) {
            doc.addPage();
            pageNum++;
            addPageHeader(pageNum);
            doc.y = 70;
          }

          const statusColor = citation.status === 'VERIFIED' ? '#16A34A' : (citation.status === 'PARTIAL' ? '#D97706' : '#DC2626');
          
          doc.rect(50, doc.y, 495, 18).fill('#F8FAFC');
          doc.fillColor(statusColor).fontSize(8).font('Helvetica-Bold').text(citation.status, 55, doc.y + 5);
          
          doc.fillColor(darkColor).fontSize(8.5).font('Helvetica').text(
            citation.rawCitation.length > 110 ? citation.rawCitation.substring(0, 110) + '...' : citation.rawCitation, 120, doc.y + 5, { width: 410 }
          );
          
          doc.y += 23;
        }
        
        if (data.citations.length > 15) {
          doc.fillColor(secondaryColor).fontSize(9).font('Helvetica-Oblique').text(`... y ${data.citations.length - 15} referencias más analizadas en la plataforma.`, 50, doc.y);
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
