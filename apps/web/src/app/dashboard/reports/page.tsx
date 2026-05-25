'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Download, FileSpreadsheet, BarChart, Calendar, Filter, ShieldAlert } from 'lucide-react';

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalEvaluations: 0, averageScore: 0, plagiarismCases: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Llamar a las estadísticas generales
    apiClient<any>('/dashboard/stats')
      .then((res) => {
        if (res.data) {
          setStats({
            totalEvaluations: res.data.totalSubmissions || 0,
            averageScore: res.data.averageScore ? parseFloat(res.data.averageScore.toFixed(1)) : 0,
            plagiarismCases: res.data.totalPlagiarismAlerts || 0
          });
        }
      })
      .catch((err) => console.error("Error cargando estadísticas:", err));

    // 2. Llamar a los datos de la tabla (Timeline)
    apiClient<any>('/dashboard/timeline')
      .then((res) => {
        console.log("📈 DATOS REALES DEL TIMELINE:", res.data);
        setReports(res.data || []);
      })
      .catch((err) => console.error("Error cargando timeline:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center animate-pulse">Cargando reportes analíticos...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Reportes Analíticos
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Genera y exporta estadísticas de evaluación por programa y periodo</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span>Filtrar</span>
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Evaluaciones</p>
            <p className="text-2xl font-bold">{stats.totalEvaluations}</p>
          </div>
        </div>
        <div className="glass-card p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center">
            <BarChart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Nota Promedio Global</p>
            <p className="text-2xl font-bold">{stats.averageScore}</p>
          </div>
        </div>
        <div className="glass-card p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Casos de Plagio</p>
            <p className="text-2xl font-bold">{stats.plagiarismCases}</p>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-surface-200 dark:border-surface-700 flex justify-between items-center">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" /> Rendimiento de Tesis Recientes
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-50 dark:bg-surface-800/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Proyecto / Documento</th>
                <th className="px-6 py-4 font-medium">Nota IA</th>
                <th className="px-6 py-4 font-medium">Alertas Plagio</th>
                <th className="px-6 py-4 font-medium">Hallazgos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No hay evaluaciones registradas en el sistema.
                  </td>
                </tr>
              ) : (
                reports.map((row: any, index: number) => (
                  <tr key={index} className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors">
                    <td className="px-6 py-4">{new Date(row.submittedAt || Date.now()).toLocaleDateString('es-PE')}</td>
                    <td className="px-6 py-4 font-medium">{row.fileName || 'Documento'}</td>
                    <td className="px-6 py-4">
                      {row.overallScore ? (
                        <span className={`px-2 py-1 rounded-md font-semibold text-xs ${row.overallScore >= 14 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                          {row.overallScore}/20
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {row._count?.plagiarismAlerts > 0 ? (
                        <span className="text-red-600 font-semibold">{row._count.plagiarismAlerts}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge-major">{row._count?.findings || 0}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}