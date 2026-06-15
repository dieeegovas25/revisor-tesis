import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"Revisor Tesis IA" <${user || 'no-reply@revisor-tesis.edu.pe'}>`;

  let transporter;

  if (user && pass) {
    console.log(`✉️ [Email] Usando cuenta de correo SMTP configurada: ${user}`);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // True para puerto 465, false para otros (587)
      auth: {
        user,
        pass,
      },
    });
  } else {
    console.log(`✉️ [Email] Sin credenciales SMTP en .env. Generando cuenta de pruebas temporal con Ethereal...`);
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  const info = await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  });

  console.log(`✅ [Email] Correo enviado exitosamente a: ${options.to}`);
  
  // Si usamos ethereal, registrar enlace de previsualización
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`\n============================================================`);
    console.log(`📧 [EMAIL PREVIEW] Correo de prueba enviado.`);
    console.log(`🔗 Ver correo y PDF aquí: ${previewUrl}`);
    console.log(`============================================================\n`);
  }
}
