// ==============================================================
// NOTIFICATION WORKER — Expo Push Notifications
// ==============================================================

import { Worker } from 'bullmq';
import { PrismaClient, NotificationType } from '@prisma/client';
import IORedis from 'ioredis';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { QUEUES, NOTIFICATION_TEMPLATES } from '@revisor-tesis/shared';
import { generateReviewPDF } from './utils/pdf-generator';
import { sendEmail } from './utils/email-sender';

const expo = new Expo();

export function startNotificationWorker(prisma: PrismaClient, connection: IORedis) {
  const worker = new Worker(
    QUEUES.NOTIFICATIONS,
    async (job) => {
      const { userId, type, projectTitle, advisorId, submissionId } = job.data;
      console.log(`🔔 [Notif] Enviando ${type} a usuario ${userId}`);

      // Obtener datos del usuario
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, expoPushToken: true, firstName: true },
      });
      if (!user) return;

      // Construir notificación
      let title = '';
      let body = '';
      const template = NOTIFICATION_TEMPLATES[type as keyof typeof NOTIFICATION_TEMPLATES];
      if (template) {
        title = template.title;
        if (type === 'AI_REVIEW_COMPLETE' || type === 'DEADLINE_REMINDER_48H' || type === 'DEADLINE_REMINDER_24H') {
          body = (template.body as (t: string, d?: string) => string)(projectTitle || '', '');
        } else if (type === 'ADVISOR_APPROVED' || type === 'ADVISOR_REJECTED') {
          const advisor = advisorId ? await prisma.user.findUnique({ where: { id: advisorId }, select: { firstName: true, lastName: true } }) : null;
          body = (template.body as (n: string, t: string) => string)(`${advisor?.firstName || ''} ${advisor?.lastName || ''}`, projectTitle || '');
        }
      }

      // Guardar en BD
      await prisma.notification.create({
        data: {
          userId, type: type as NotificationType,
          title, body,
          data: JSON.stringify({ submissionId, projectTitle }),
          sentAt: new Date(),
        },
      });

      // Enviar push si tiene token
      if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
        const message: ExpoPushMessage = {
          to: user.expoPushToken,
          sound: 'default',
          title, body,
          data: { submissionId, type },
        };
        try {
          await expo.sendPushNotificationsAsync([message]);
          console.log(`✅ [Notif] Push enviado a ${user.firstName}`);
        } catch (e) {
          console.warn(`⚠️ [Notif] Error push:`, (e as Error).message);
        }
      }

      // Enviar correo con reporte PDF adjunto si la revisión de la IA terminó
      if (type === 'AI_REVIEW_COMPLETE' && submissionId) {
        try {
          console.log(`📄 [Notif] Obteniendo detalles de la tesis para generar PDF...`);
          const submission = await prisma.documentSubmission.findUnique({
            where: { id: submissionId },
            include: {
              project: {
                include: {
                  student: true,
                  advisor: true,
                }
              },
              findings: true,
              citationValidations: true,
              plagiarismAlerts: true,
            }
          });

          if (submission) {
            const pdfData = {
              title: submission.project.title,
              studentName: `${submission.project.student.firstName} ${submission.project.student.lastName}`,
              advisorName: submission.project.advisor 
                ? `${submission.project.advisor.firstName} ${submission.project.advisor.lastName}`
                : 'No asignado',
              campus: 'Campus Trujillo',
              submittedAt: submission.submittedAt,
              overallScore: submission.overallScore,
              findings: submission.findings.map(f => ({
                category: f.category,
                severity: f.severity,
                title: f.title,
                description: f.description,
                instruction: f.instruction,
                affectedSection: f.affectedSection,
                pageNumber: f.pageNumber,
              })),
              citations: submission.citationValidations.map(c => ({
                rawCitation: c.rawCitation,
                status: c.status,
                matchScore: c.matchScore,
                crossrefTitle: c.crossrefTitle,
              })),
              plagiarism: submission.plagiarismAlerts.map(p => ({
                similarityScore: p.similarityScore,
                matchedFileName: p.matchedFileName,
              })),
            };

            console.log(`📄 [Notif] Generando PDF de reporte para la tesis: "${pdfData.title}"`);
            const pdfBuffer = await generateReviewPDF(pdfData);

            const emailTo = 'angel.cojal@gmail.com';
            console.log(`✉️ [Notif] Enviando reporte por email a ${emailTo}...`);

            const scoreText = pdfData.overallScore !== null ? `${pdfData.overallScore.toFixed(1)} / 20.0` : 'Sin nota';

            const emailSubject = `Reporte de Revisión IA: ${pdfData.title}`;
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">Revisión de Tesis Finalizada</h2>
                <p>Estimado/a <strong>${pdfData.studentName}</strong>,</p>
                <p>La evaluación automática por Inteligencia Artificial de su borrador de tesis ha sido completada con éxito.</p>
                
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 5px 0; font-weight: bold; color: #475569; width: 130px;">Proyecto:</td>
                      <td style="padding: 5px 0; color: #0f172a;">${pdfData.title}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; font-weight: bold; color: #475569;">Asesor:</td>
                      <td style="padding: 5px 0; color: #0f172a;">${pdfData.advisorName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; font-weight: bold; color: #475569;">Nota Sugerida:</td>
                      <td style="padding: 5px 0; font-weight: bold; color: #1e3a8a; font-size: 16px;">${scoreText}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; font-weight: bold; color: #475569;">Observaciones:</td>
                      <td style="padding: 5px 0; color: #0f172a;">${pdfData.findings.length} encontradas</td>
                    </tr>
                  </table>
                </div>

                <p>Adjunto a este correo encontrará el informe detallado en formato PDF con la descripción de cada observación y las recomendaciones para su corrección.</p>
                
                <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                  Este es un correo automático generado por el Revisor de Tesis IA. Por favor, no responda a este mensaje.
                </p>
              </div>
            `;

            await sendEmail({
              to: emailTo,
              subject: emailSubject,
              text: `Hola, la revisión de la tesis "${pdfData.title}" ha finalizado con una nota de ${scoreText}. Se adjunta el reporte en PDF.`,
              html: emailHtml,
              attachments: [
                {
                  filename: `Reporte_Revision_${submissionId.substring(0, 8)}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                }
              ]
            });
            
            if (user.email && user.email !== emailTo) {
              console.log(`✉️ [Notif] Enviando copia del reporte al estudiante: ${user.email}`);
              await sendEmail({
                to: user.email,
                subject: emailSubject,
                text: `Hola ${pdfData.studentName}, la revisión de tu tesis "${pdfData.title}" ha finalizado con una nota de ${scoreText}. Se adjunta el reporte en PDF.`,
                html: emailHtml,
                attachments: [
                  {
                    filename: `Reporte_Revision_${submissionId.substring(0, 8)}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                  }
                ]
              }).catch(e => console.warn(`⚠️ [Notif] Falló enviar correo al estudiante:`, e.message));
            }
          }
        } catch (err: any) {
          console.error(`❌ [Notif] Error al generar o enviar reporte en PDF: ${err.message}`, err);
        }
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, error) => {
    console.error(`❌ [Notif] Job ${job?.id} falló:`, error.message);
  });
  console.log('   ✅ Notification Worker iniciado');
}
