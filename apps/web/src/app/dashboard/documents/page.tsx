'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiClient, uploadFile } from '@/lib/api-client';
import { Upload, FileText, CheckCircle2, AlertTriangle, Clock, XCircle, Eye } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  UPLOADED: { label: 'Subido', color: 'badge-info', icon: Clock },
  EXTRACTING: { label: 'Extrayendo', color: 'badge-info', icon: Clock },
  VECTORIZING: { label: 'Vectorizando', color: 'badge-minor', icon: Clock },
  ANALYZING: { label: 'Analizando IA', color: 'badge-major', icon: Clock },
  REVIEWED: { label: 'Revisado', color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold', icon: CheckCircle2 },
  ERROR: { label: 'Error en el Análisis', color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 px-3 py-1 rounded-full text-xs font-semibold', icon: XCircle },
  FAILED: { label: 'Error en el Análisis', color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 px-3 py-1 rounded-full text-xs font-semibold', icon: XCircle },
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchDocuments = useCallback(() => {
    apiClient<any>('/documents')
      .then((res) => setDocuments(res.data || []))
      .catch((err) => console.error('Error fetching documents:', err));
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Polling silencioso si hay algún documento procesándose
  useEffect(() => {
    const hasProcessing = documents.some(
      (doc) =>
        doc.status === 'UPLOADED' ||
        doc.status === 'EXTRACTING' ||
        doc.status === 'VECTORIZING' ||
        doc.status === 'ANALYZING'
    );

    if (!hasProcessing) return;

    const interval = setInterval(() => {
      apiClient<any>('/documents')
        .then((res) => {
          setDocuments(res.data || []);
        })
        .catch((err) => {
          console.error('Error polling documents:', err);
          const isUnauthorized = 
            err.message?.includes('401') || 
            err.message?.toLowerCase().includes('unauthorized') ||
            err.message?.toLowerCase().includes('token');
          if (isUnauthorized) {
            clearInterval(interval);
          }
        });
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        try {
          await uploadFile('/thesis', file);
        } catch (err: any) {
          console.error(`Error al subir ${file.name}:`, err);
          alert(`No se pudo subir ${file.name}: ${err.message}`);
        }
      });
      await Promise.all(uploadPromises);
      fetchDocuments();
    } catch (err: any) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }, [fetchDocuments]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Documentos</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Sube y revisa tus avances de tesis</p>
      </div>

      {/* Upload zone */}
      <div className={`glass-card p-8 border-2 border-dashed transition-all duration-200 cursor-pointer text-center ${dragOver ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        onClick={() => document.getElementById('file-input')?.click()}>
        <input id="file-input" type="file" className="hidden" accept=".pdf,.docx,.doc" multiple onChange={(e) => handleUpload(e.target.files)} />
        {uploading ? (
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
        ) : (
          <>
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
            <p className="font-medium">Arrastra tu documento aquí o haz clic para seleccionar</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">PDF, DOCX — máximo 50MB</p>
          </>
        )}
      </div>

      {/* Documents list */}
      <div className="space-y-4">
        {documents.map((doc, i) => {
          const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.UPLOADED;
          const StatusIcon = statusCfg.icon;
          return (
            <div key={doc.id} className="glass-card p-5 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-surface-100 dark:bg-surface-700 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">{doc.fileName}</h4>
                    <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                      <span>{new Date(doc.submittedAt).toLocaleDateString('es-PE')}</span>
                      {doc.overallScore != null && <span className="font-semibold text-primary-600">Nota: {doc.overallScore}/20</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={statusCfg.color}><StatusIcon className="w-3 h-3 inline mr-1" />{statusCfg.label}</span>
                  <div className="flex gap-1 text-xs">
                    {doc.findingsCount > 0 && <span className="badge-major">{doc.findingsCount} hallazgos</span>}
                    {doc.plagiarismAlertsCount > 0 && <span className="badge-critical">{doc.plagiarismAlertsCount} plagio</span>}
                  </div>
                  <Link href={`/dashboard/documents/${doc.id}`} className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-xl transition-colors" title="Ver detalle">
                    <Eye className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
