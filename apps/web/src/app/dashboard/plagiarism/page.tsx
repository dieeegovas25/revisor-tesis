'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ShieldAlert, AlertTriangle, CheckCircle, Search, Eye } from 'lucide-react';
import Link from 'next/link';

export default function GlobalPlagiarismPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    apiClient<any>('/plagiarism')
      .then((res) => {
        setReports(res.data || []);
      })
      .catch((err) => {
        console.error("Error cargando plagio:", err);
        // Si el error es 403 Forbidden, activamos la pantalla de bloqueo
        if (err.message.includes('Forbidden') || err.message.includes('403')) {
          setAccessDenied(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = reports.filter(r =>
    r.documentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.studentName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center animate-pulse">Cargando análisis global de similitud...</div>;
  if (accessDenied) {
    return (
      <div className="glass-card p-12 text-center max-w-lg mx-auto mt-10 animate-fade-in">
        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Acceso Restringido</h2>
        <p className="text-gray-500 mt-2">
          Por motivos de seguridad y privacidad, este panel de monitoreo global de similitudes es exclusivo para Coordinadores, Directores y Asesores de la Facultad.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-primary-600 hover:underline font-medium">
          Volver a mis documentos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ShieldAlert className="text-red-600 w-8 h-8" /> Control de Similitud (Plagio)
          </h1>
          <p className="text-gray-500 mt-1">Monitoreo global de originalidad de tesis en la institución.</p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por documento..."
            className="input-field w-full pl-10 py-2 border rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-100/50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700">
                <th className="p-4 font-semibold text-sm text-surface-600 dark:text-surface-300">Documento / Proyecto</th>
                <th className="p-4 font-semibold text-sm text-surface-600 dark:text-surface-300">Fecha</th>
                <th className="p-4 font-semibold text-sm text-surface-600 dark:text-surface-300">Nivel de Similitud</th>
                <th className="p-4 font-semibold text-sm text-surface-600 dark:text-surface-300 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    No hay reportes de plagio registrados aún.
                  </td>
                </tr>
              ) : (
                filteredReports.map((report, idx) => {
                  // Asumimos que el backend devuelve un similarityScore de 0 a 100
                  const score = report.maxSimilarityScore ? Math.round(report.maxSimilarityScore * 100) : 0;
                  let statusColor = "bg-emerald-500";
                  let badgeClass = "bg-emerald-100 text-emerald-700";
                  let Icon = CheckCircle;

                  if (score > 80) {
                    statusColor = "bg-red-500";
                    badgeClass = "bg-red-100 text-red-700";
                    Icon = AlertTriangle;
                  } else if (score > 30) {
                    statusColor = "bg-amber-500";
                    badgeClass = "bg-amber-100 text-amber-700";
                    Icon = AlertTriangle;
                  }

                  return (
                    <tr key={idx} className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                      <td className="p-4">
                        <p className="font-medium text-gray-900 dark:text-white">{report.documentName || 'Documento sin nombre'}</p>
                        <p className="text-xs text-gray-500">ID: {report.submissionId}</p>
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {new Date(report.analyzedAt || Date.now()).toLocaleDateString('es-PE')}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}`}>
                            <Icon className="w-3 h-3" /> {score}%
                          </span>
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full ${statusColor}`} style={{ width: `${score}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/dashboard/documents/${report.submissionId}`}
                          className="inline-flex items-center justify-center p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-5 h-5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}