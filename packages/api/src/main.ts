import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo global de API
  app.setGlobalPrefix('api');

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS dinámico para Next.js, Expo y pruebas en red local (Celulares)
  app.enableCors({
    origin: true, // Esto detecta tu IP local (celular) automáticamente y le da acceso
    credentials: true,
  });

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Revisor de Tesis API corriendo en puerto ${port} (API)`);
}
bootstrap();