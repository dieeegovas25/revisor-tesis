'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Mic,
  MicOff,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Bot,
  Loader2
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'bot',
      text: '¡Hola! Soy el asistente inteligente oficial del Revisor de Tesis de la UNT. ¿En qué puedo ayudarte hoy? Puedes consultarme sobre dudas del sistema o pedirme estadísticas de tesis en tiempo real.',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const isSendingRef = useRef(false);
  const silenceTimeoutRef = useRef<any>(null);

  // Desplazar al final de la conversación al recibir nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Inicializar la API de reconocimiento de voz (SpeechRecognition)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-PE';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          // Mostrar el texto reconocido hasta el momento en la caja de texto
          const currentText = finalTranscript || interimTranscript;
          if (currentText) {
            setInputMessage(currentText);
          }

          // Reiniciar el temporizador de silencio (1.8 segundos)
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          silenceTimeoutRef.current = setTimeout(() => {
            // Reconstruir todo el texto acumulado de la sesión
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
              fullTranscript += event.results[i][0].transcript + ' ';
            }
            fullTranscript = fullTranscript.trim();

            if (!fullTranscript && currentText) {
              fullTranscript = currentText.trim();
            }

            if (fullTranscript) {
              try {
                recognition.stop();
              } catch (e) {}
              setIsVoiceActive(true);
              handleSendMessage(fullTranscript, true);
            }
          }, 1800);
        };

        recognition.onerror = (event: any) => {
          console.error('Error de reconocimiento de voz:', event.error);
          setIsListening(false);
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignorar
        }
      }
    };
  }, []);

  // Detener la síntesis de voz si se desactiva el switch
  useEffect(() => {
    if (!isVoiceActive && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isVoiceActive]);

  // Detener la síntesis si se cierra el widget
  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isOpen]);

  // Leer respuesta por síntesis de voz (window.speechSynthesis)
  const speakText = (text: string, force: boolean = false) => {
    if ((!isVoiceActive && !force) || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Cancelar cualquier síntesis en curso
    window.speechSynthesis.cancel();

    // Eliminar formato Markdown básico para que la lectura suene natural
    const cleanText = text
      .replace(/[*_#`~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-PE';
    window.speechSynthesis.speak(utterance);
  };

  // Activar/desactivar escucha de voz
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Tu navegador no soporta el reconocimiento de voz nativo (Web Speech API).');
      return;
    }

    if (isListening) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      recognitionRef.current.stop();
      // Si el usuario detiene manualmente la escucha, enviar lo que se haya acumulado
      if (inputMessage.trim()) {
        setIsVoiceActive(true);
        handleSendMessage(inputMessage, true);
      }
    } else {
      setInputMessage('');
      recognitionRef.current.start();
    }
  };

  // Enviar mensaje al backend
  const handleSendMessage = async (textToSend?: string, wasVoiceInput: boolean = false) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isSendingRef.current) return;

    isSendingRef.current = true;
    // Agregar mensaje de usuario
    const userMsg: Message = { sender: 'user', text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await apiClient<{ success: boolean; reply: string }>('/chatbot/query', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });

      if (response.success && response.reply) {
        const botMsg: Message = {
          sender: 'bot',
          text: response.reply,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, botMsg]);
        speakText(response.reply, wasVoiceInput);
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (error: any) {
      const errorMsg: Message = {
        sender: 'bot',
        text: 'Lo siento, en este momento no puedo conectarme con el servicio de IA de la UNT. Por favor, intenta de nuevo más tarde.',
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  // Renderizar texto formateando negritas de Markdown y saltos de línea
  const renderMessageText = (text: string) => {
    return text.split('\n').map((line, idx) => {
      // Reemplazo simple para **negritas**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const renderedLine = parts.map((part, partIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={partIdx} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return (
        <span key={idx} className="block min-h-[1rem]">
          {renderedLine}
        </span>
      );
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95"
        title="Asistente IA UNT"
        aria-label="Abrir Chat de Asistente IA"
      >
        {isOpen ? <X className="w-6 h-6 animate-fade-in" /> : <MessageSquare className="w-6 h-6 animate-fade-in" />}
      </button>

      {/* Ventana de chat con Glassmorphism */}
      {isOpen && (
        <div className="absolute bottom-[72px] right-0 w-[380px] h-[550px] bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Encabezado */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  Asistente IA UNT
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </h3>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  En línea
                </p>
              </div>
            </div>

            {/* Switch Activar Voz */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsVoiceActive(!isVoiceActive)}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  isVoiceActive
                    ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:bg-slate-800/40 border border-transparent'
                }`}
                title={isVoiceActive ? 'Voz activada' : 'Activar respuesta por voz'}
              >
                {isVoiceActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Cerrar chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Historial de mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-800/60 border border-slate-700/50 text-slate-200 rounded-tl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{renderMessageText(msg.text)}</div>
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      msg.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Indicador de carga */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800/60 border border-slate-700/50 text-slate-400 rounded-2xl rounded-tl-none px-4 py-3 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Generando respuesta...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Formulario de entrada */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-xl p-1.5 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all"
            >
              {/* Botón de micrófono */}
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center shrink-0 ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                title={isListening ? 'Escuchando... Haz clic para detener' : 'Dictar por voz'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={isListening ? 'Escuchando...' : 'Escribe tu mensaje aquí...'}
                disabled={isListening}
                className="flex-1 bg-transparent border-0 outline-none focus:ring-0 text-slate-200 text-sm placeholder-slate-500 px-1 py-1"
              />

              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all flex items-center justify-center shrink-0"
                title="Enviar mensaje"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
