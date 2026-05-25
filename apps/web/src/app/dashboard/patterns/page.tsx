'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { FileSignature, Plus, Save, Settings, CheckCircle2 } from 'lucide-react';

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newPattern, setNewPattern] = useState({ name: '', description: '', rules: '' });

  // Cargar patrones existentes
  useEffect(() => {
    fetchPatterns();
  }, []);

  const fetchPatterns = async () => {
    try {
      const res = await apiClient<any>('/patterns');
      setPatterns(res.data || []);
    } catch (error) {
      console.error("Error cargando patrones:", error);
    } finally {
      setLoading(false);
    }
  };

  // Guardar un nuevo patrón
  const handleSavePattern = async () => {
    if (!newPattern.name || !newPattern.rules) return alert('El nombre y las reglas son obligatorios');

    try {
      await apiClient('/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPattern.name,
          description: newPattern.description,
          // Convertimos el texto a JSON estructurado si es posible, o lo mandamos como string
          rules: newPattern.rules,
          isActive: true
        })
      });
      setIsCreating(false);
      setNewPattern({ name: '', description: '', rules: '' });
      fetchPatterns(); // Recargar la lista
    } catch (error) {
      console.error("Error guardando:", error);
      alert('Hubo un error al guardar el patrón.');
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Cargando rúbricas...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileSignature className="text-primary-600" /> Constructor de Patrones
          </h1>
          <p className="text-gray-500 mt-1">Configura las rúbricas y reglas de evaluación para la Inteligencia Artificial.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 transition"
        >
          {isCreating ? 'Cancelar' : <><Plus className="w-5 h-5" /> Nueva Rúbrica</>}
        </button>
      </div>

      {isCreating && (
        <div className="glass-card p-6 border-l-4 border-primary-500 animate-slide-up">
          <h2 className="text-xl font-semibold mb-4">Crear Nueva Rúbrica</h2>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nombre del Patrón (Ej. Tesis Ingeniería de Sistemas)</label>
              <input
                type="text"
                className="input-field w-full p-2 border rounded-lg"
                value={newPattern.name}
                onChange={(e) => setNewPattern({ ...newPattern, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Descripción</label>
              <input
                type="text"
                className="input-field w-full p-2 border rounded-lg"
                value={newPattern.description}
                onChange={(e) => setNewPattern({ ...newPattern, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Instrucciones de Evaluación (Prompt / Reglas)</label>
              <textarea
                className="input-field w-full p-3 border rounded-lg font-mono text-sm h-32"
                placeholder="Ej: El documento DEBE contener los siguientes capítulos: 1. Introducción, 2. Marco Teórico..."
                value={newPattern.rules}
                onChange={(e) => setNewPattern({ ...newPattern, rules: e.target.value })}
              />
            </div>
            <div className="flex justify-end mt-2">
              <button onClick={handleSavePattern} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">
                <Save className="w-4 h-4" /> Guardar Patrón
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {patterns.length === 0 && !isCreating ? (
          <div className="text-center p-12 glass-card text-gray-500">No hay patrones configurados. Crea el primero.</div>
        ) : (
          patterns.map((pattern) => (
            <div key={pattern.id} className="glass-card p-5 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  {pattern.name}
                  {pattern.isActive && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{pattern.description}</p>
              </div>
              <button className="p-2 text-gray-400 hover:text-primary-600 transition bg-surface-100 rounded-lg">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}