'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Award, Loader2, CheckCircle, XCircle, Search, BookOpen } from 'lucide-react';

export default function ProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [orcidId, setOrcidId] = useState('');
    const [thesisTopic, setThesisTopic] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');

    // Cargar los datos del usuario logueado
    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (stored) setUser(JSON.parse(stored));
    }, []);

    const handleVerifyOrcid = async () => {
        if (!orcidId || !thesisTopic) {
            setError('Por favor ingresa tanto tu ORCID como el tema de tesis.');
            return;
        }

        // Formato simple de validación visual de ORCID (ej. 0000-0002-1825-0097)
        if (orcidId.length < 15) {
            setError('El formato del ORCID no parece válido.');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            // Llamamos a la magia de tu backend
            const response = await apiClient<any>(`/orcid/verify/${user.id}`, {
                method: 'POST',
                body: JSON.stringify({ orcidId, thesisTopic })
            });

            setResult(response);
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error al verificar el ORCID.');
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Award className="text-primary-600 w-8 h-8" /> Mi Perfil Académico
                </h1>
                <p className="text-gray-500 mt-1">Vincula tu identificador ORCID para validar tu idoneidad como asesor.</p>
            </div>

            <div className="glass-card p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Search className="w-5 h-5 text-gray-400" /> Verificación con Inteligencia Artificial
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tu ID de ORCID</label>
                        <input
                            type="text"
                            placeholder="Ej: 0000-0002-1825-0097"
                            value={orcidId}
                            onChange={(e) => setOrcidId(e.target.value)}
                            className="input-field w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Ingresa tu código público de 16 dígitos.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tema de Tesis a Supervisar</label>
                        <input
                            type="text"
                            placeholder="Ej: Uso de Machine Learning en el diagnóstico temprano de Diabetes"
                            value={thesisTopic}
                            onChange={(e) => setThesisTopic(e.target.value)}
                            className="input-field w-full"
                        />
                    </div>

                    {error && <div className="text-red-500 text-sm font-medium p-3 bg-red-50 rounded-lg">{error}</div>}

                    <button
                        onClick={handleVerifyOrcid}
                        disabled={loading}
                        className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookOpen className="w-5 h-5" />}
                        {loading ? 'Analizando publicaciones con IA...' : 'Verificar Idoneidad'}
                    </button>
                </div>
            </div>

            {/* Resultados de la Evaluación IA */}
            {result && (
                <div className={`p-6 rounded-2xl border-2 shadow-lg animate-fade-in ${result.isVerified ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start gap-4">
                        {result.isVerified ? (
                            <CheckCircle className="w-10 h-10 text-emerald-600 shrink-0" />
                        ) : (
                            <XCircle className="w-10 h-10 text-red-600 shrink-0" />
                        )}
                        <div>
                            <h3 className={`text-xl font-bold ${result.isVerified ? 'text-emerald-800' : 'text-red-800'}`}>
                                {result.isVerified ? 'Asesor Verificado Exitosamente' : 'Perfil No Idóneo para este Tema'}
                            </h3>
                            <p className="text-gray-700 mt-2 text-sm leading-relaxed">
                                <strong>Análisis de Gemini IA:</strong> {result.justification}
                            </p>
                            <div className="mt-4 inline-block bg-white px-3 py-1 rounded-full text-xs font-semibold text-gray-600 border shadow-sm">
                                Se analizaron {result.totalPublications} publicaciones.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}