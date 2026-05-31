import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class MinioService {
  private supabase: SupabaseClient;

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_KEY');

    if (!url || !key) {
      throw new Error('Variables de entorno de Supabase no configuradas');
    }

    this.supabase = createClient(url, key);
  }

  async uploadDocument(fileName: string, buffer: Buffer, mimeType: string): Promise<string> {
    const filePath = `documents/${Date.now()}-${fileName}`;

    // Subir a Supabase
    const { data, error } = await this.supabase.storage
      .from('tesis-files') // El nombre exacto de tu bucket en Supabase
      .upload(filePath, buffer, {
        contentType: mimeType,
      });

    if (error) throw error;
    return filePath;
  }

  async getPresignedUrl(key: string): Promise<string> {
    // Supabase maneja los archivos públicos de forma distinta
    // Si tu bucket es público, simplemente devolvemos la URL pública
    const { data } = this.supabase.storage
      .from('tesis-files')
      .getPublicUrl(key);

    return data.publicUrl;
  }

}