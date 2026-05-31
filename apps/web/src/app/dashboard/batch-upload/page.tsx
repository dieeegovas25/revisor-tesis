'use client';

import { useState } from 'react';
import { uploadFile } from '@/lib/api-client';
import { UploadCloud, FileText, CheckCircle, XCircle, Loader2, ListPlus } from 'lucide-react';
import Link from 'next/link';

export default function BatchUploadPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [results, setResults] = useState<{ name: string; status: 'success' | 'error' }[]>([]);

    // Manejar la selección de múltiples archivos
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
            setResults([]); // Limpiar resultados anteriores
        }
    };

    // Subir los archivos uno por uno
    const handleBatchUpload = async () => {
        if (files.length === 0) return;
        setUploading(true);
        setResults([]);

        const uploadResults = [];

        // Usamos un bucle for...of para enviarlos de forma ordenada
        for (const file of files) {
            try {
                // Le pasamos el archivo crudo, api-client lo empaquetará
                await uploadFile('/thesis', file);

                uploadResults.push({ name: file.name, status: 'success' as const });
            } catch (error) {
                console.error(`Error subiendo ${file.name}:`, error);
                uploadResults.push({ name: file.name, status: 'error' as const });
            }

            setResults([...uploadResults]);
        }

        setUploading(false);
        setFiles([]); // Limpiamos la selección al terminar
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <ListPlus className="text-primary-600 w-8 h-8" /> Revisión por Lotes
                </h1>
                <p className="text-gray-500 mt-1">Sube múltiples proyectos de tesis al mismo tiempo. El sistema los encolará automáticamente.</p>
            </div>

            <div className="glass-card p-8 text-center border-2 border-dashed border-surface-300 dark:border-surface-600 hover:border-primary-500 transition-colors relative">
                <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={uploading}
                />
                <UploadCloud className="w-16 h-16 text-primary-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Haz clic aquí o arrastra tus archivos</h3>
                <p className="text-gray-500 text-sm mb-4">Soporta PDF y DOCX (Puedes seleccionar varios a la vez)</p>

                {files.length > 0 && !uploading && (
                    <div className="bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 p-3 rounded-lg inline-block font-medium">
                        {files.length} archivo(s) listo(s) para subir
                    </div>
                )}
            </div>

            {files.length > 0 && !uploading && (
                <div className="flex justify-end">
                    <button
                        onClick={handleBatchUpload}
                        className="btn-primary flex items-center gap-2 px-6 py-3 text-lg"
                    >
                        <UploadCloud className="w-5 h-5" />
                        Iniciar Procesamiento Masivo
                    </button>
                </div>
            )}

            {/* Panel de Resultados */}
            {(uploading || results.length > 0) && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        {uploading ? <Loader2 className="w-5 h-5 animate-spin text-primary-600" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
                        {uploading ? `Procesando... (${results.length} de ${files.length})` : 'Procesamiento completado'}
                    </h3>

                    <div className="space-y-3">
                        {results.map((res, idx) => (
                            <div key={idx} className={`p-3 rounded-lg flex items-center justify-between border ${res.status === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                                <div className="flex items-center gap-3">
                                    <FileText className="w-5 h-5" />
                                    <span className="font-medium">{res.name}</span>
                                </div>
                                {res.status === 'success' ? (
                                    <span className="flex items-center gap-1 text-sm font-bold"><CheckCircle className="w-4 h-4" /> Encolado</span>
                                ) : (
                                    <span className="flex items-center gap-1 text-sm font-bold"><XCircle className="w-4 h-4" /> Error</span>
                                )}
                            </div>
                        ))}
                    </div>

                    {!uploading && results.length > 0 && (
                        <div className="mt-6 pt-4 border-t flex justify-end">
                            <Link href="/dashboard" className="btn-secondary">
                                Ir al Dashboard de Documentos
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}