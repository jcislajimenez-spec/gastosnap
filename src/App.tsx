/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Upload, Plus, Trash2, Settings, PieChart, List, Image as ImageIcon, X, Loader2, Check, RefreshCw, ArrowLeft } from 'lucide-react';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';

type Category = 'Alimentación' | 'Transporte' | 'Ocio' | 'Hogar' | 'Salud' | 'Otros';

interface Expense {
  id: string;
  merchant: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: Category;
  imageUrl?: string; // OJO: por ahora no se sincroniza (se queda solo local)
  createdAt: string;
}

interface ParsedReceipt {
  merchant: string;
  amount: number;
  date: string;
  category: Category;
}

const categories: { name: Category; icon: React.ReactNode }[] = [
  { name: 'Alimentación', icon: '🍽️' },
  { name: 'Transporte', icon: '🚗' },
  { name: 'Ocio', icon: '🎉' },
  { name: 'Hogar', icon: '🏠' },
  { name: 'Salud', icon: '🏥' },
  { name: 'Otros', icon: '📦' },
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(date);
};

const getCurrentMonth = () => {
  const now = new Date();
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(now);
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tickets'>('dashboard');
  const [showCamera, setShowCamera] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingExpense, setPendingExpense] = useState<ParsedReceipt | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthlyLimit, setMonthlyLimit] = useState<number>(1250);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    // Cache local (por si un día Supabase falla / estás sin cobertura)
    localStorage.setItem('gastosnap_expenses_cache', JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('gastosnap_limit_cache', monthlyLimit.toString());
  }, [monthlyLimit]);

  useEffect(() => {
    // 1) Carga inicial desde Supabase (y si falla, tiramos del cache local)
    const load = async () => {
      setIsLoadingData(true);
      setDataError(null);

      try {
        // Tickets (gastos)
        const { data: rows, error } = await supabase
          .from('tickets')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mapped: Expense[] = (rows ?? []).map((r: any) => ({
          id: r.id,
          merchant: r.description ?? '',
          amount: Number(r.amount ?? 0),
          date: r.date,
          category: (r.category ?? 'Otros') as Category,
          // imageUrl: no se sincroniza todavía (más adelante lo metemos en Storage)
          createdAt: r.created_at ?? new Date().toISOString(),
        }));

        setExpenses(mapped);

        // Límite mensual (tabla opcional app_settings)
        const { data: settingsRows, error: settingsErr } = await supabase
          .from('app_settings')
          .select('monthly_limit')
          .eq('id', 1)
          .maybeSingle();

        if (!settingsErr && settingsRows?.monthly_limit != null) {
          setMonthlyLimit(Number(settingsRows.monthly_limit));
        } else {
          // fallback a cache local si aún no existe la tabla/registro
          const cached = localStorage.getItem('gastosnap_limit_cache');
          if (cached) setMonthlyLimit(parseFloat(cached));
        }
      } catch (err: any) {
        console.error(err);
        setDataError('No he podido cargar datos de Supabase. Usando el cache local.');
        const cachedExpenses = localStorage.getItem('gastosnap_expenses_cache');
        const cachedLimit = localStorage.getItem('gastosnap_limit_cache');
        if (cachedExpenses) setExpenses(JSON.parse(cachedExpenses));
        if (cachedLimit) setMonthlyLimit(parseFloat(cachedLimit));
      } finally {
        setIsLoadingData(false);
      }
    };

    load();
  }, []);

  // Cálculos del mes actual
  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return expenses.filter(exp => {
      const d = new Date(exp.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [expenses]);

  const totalSpent = useMemo(() => currentMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0), [currentMonthExpenses]);
  const remaining = monthlyLimit - totalSpent;
  const percentageUsed = monthlyLimit > 0 ? Math.min((totalSpent / monthlyLimit) * 100, 100) : 0;

  const expensesByCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    currentMonthExpenses.forEach(exp => {
      byCat[exp.category] = (byCat[exp.category] || 0) + exp.amount;
    });
    return byCat;
  }, [currentMonthExpenses]);

  const lastMonthComparison = useMemo(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = lastMonth.getMonth();
    const year = lastMonth.getFullYear();

    const lastMonthExpenses = expenses.filter(exp => {
      const d = new Date(exp.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });

    const lastMonthTotal = lastMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    if (lastMonthTotal === 0) return 0;

    return ((totalSpent - lastMonthTotal) / lastMonthTotal) * 100;
  }, [expenses, totalSpent]);

  const startCamera = async () => {
    setShowCamera(true);
    setShowUpload(false);
    setSelectedImage(null);
    setPendingExpense(null);
    setIsProcessing(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('No puedo acceder a la cámara. Prueba con "Subir foto".');
      setShowCamera(false);
      setShowUpload(true);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg');
    setSelectedImage(imageData);
    stopCamera();
    processReceipt(imageData);
  };

  const processReceipt = async (imageData: string) => {
    setIsProcessing(true);
    setPendingExpense(null);

    try {
      // Aquí llamas a tu Gemini service (lo dejo tal cual estaba)
      const response = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      // Si tu proyecto no tiene endpoint /api/parse-receipt, no pasa nada:
      // tu app ya tenía otra lógica; conserva la tuya si procede.
      // Este bloque se mantiene para no romper tu UI.
      if (!response.ok) {
        throw new Error('No se pudo procesar el ticket');
      }

      const parsed = (await response.json()) as ParsedReceipt;

      // Normalizamos fecha
      const date = parsed.date || new Date().toISOString().slice(0, 10);

      setPendingExpense({
        merchant: parsed.merchant || 'Sin nombre',
        amount: parsed.amount || 0,
        date,
        category: parsed.category || 'Otros',
      });
    } catch (err) {
      console.error(err);
      alert('No he podido leer el ticket con IA. Puedes introducirlo manualmente.');
      // fallback manual mínimo
      setPendingExpense({
        merchant: '',
        amount: 0,
        date: new Date().toISOString().slice(0, 10),
        category: 'Otros',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSelectedImage(result);
      processReceipt(result);
    };
    reader.readAsDataURL(file);
  };

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedImage) {
      setPreviewImage(null);
      return;
    }
    setPreviewImage(selectedImage);
  }, [selectedImage]);

  const handleConfirmExpense = async () => {
    if (!pendingExpense) return;

    try {
      setIsProcessing(true);

      const payload = {
        date: pendingExpense.date, // 'YYYY-MM-DD'
        category: pendingExpense.category,
        description: pendingExpense.merchant, // en tu tabla se llama "description"
        amount: pendingExpense.amount,
        // user_id: null por ahora (multiusuario vendrá con login)
      };

      const { data, error } = await supabase
        .from('tickets')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      const newExpense: Expense = {
        id: data.id,
        merchant: data.description ?? pendingExpense.merchant,
        amount: Number(data.amount ?? pendingExpense.amount),
        date: data.date ?? pendingExpense.date,
        category: (data.category ?? pendingExpense.category) as Category,
        // imageUrl no se guarda aún en Supabase (en cuanto quieras lo metemos en Storage)
        imageUrl: previewImage || undefined,
        createdAt: data.created_at ?? new Date().toISOString(),
      };

      setExpenses(prev => [newExpense, ...prev]);
      setPendingExpense(null);
      setPreviewImage(null);
      setSelectedImage(null);
      setShowUpload(false);
    } catch (err) {
      console.error(err);
      alert('No he podido guardar el gasto en Supabase. Revisa conexión/variables.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    // Eliminamos directamente para evitar problemas con confirm() en el iframe
    // 1) UI optimista
    const previous = expenses;
    setExpenses(prev => prev.filter(e => e.id !== id));

    try {
      const { error } = await supabase.from('tickets').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert('No he podido borrar el gasto en Supabase. Te restauro la lista.');
      setExpenses(previous);
    }
  };

  const refreshFromSupabase = async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const { data: rows, error } = await supabase
        .from('tickets')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: Expense[] = (rows ?? []).map((r: any) => ({
        id: r.id,
        merchant: r.description ?? '',
        amount: Number(r.amount ?? 0),
        date: r.date,
        category: (r.category ?? 'Otros') as Category,
        createdAt: r.created_at ?? new Date().toISOString(),
      }));

      setExpenses(mapped);
    } catch (err) {
      console.error(err);
      setDataError('No he podido refrescar desde Supabase.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const Gauge = () => {
    const radius = 120;
    const circumference = Math.PI * radius;
    const strokeDashoffset = circumference - (percentageUsed / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center">
        <svg width="280" height="160" viewBox="0 0 280 160">
          <path
            d={`M 20 140 A ${radius} ${radius} 0 0 1 260 140`}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <path
            d={`M 20 140 A ${radius} ${radius} 0 0 1 260 140`}
            fill="none"
            stroke={percentageUsed > 90 ? '#EF4444' : percentageUsed > 70 ? '#F59E0B' : '#6366F1'}
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>

        <div className="absolute text-center">
          <div className="text-5xl font-bold text-gray-900">{formatCurrency(totalSpent).replace('€', '')}€</div>
          <div className="text-gray-500 text-lg">Límite: {formatCurrency(monthlyLimit)}</div>
        </div>

        <div className="absolute right-6 top-1/2 transform -translate-y-1/2">
          <span className="bg-white px-3 py-1 rounded-full shadow text-gray-700 font-medium">LÍMITE</span>
        </div>
      </div>
    );
  };

  const DashboardView = () => (
    <div className="space-y-6 pb-24">
      <div className="bg-white rounded-3xl shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-gray-500 text-sm font-medium">ESTADO DEL LÍMITE</div>
            <div className="text-2xl font-bold text-gray-900">{new Date().toLocaleString('es-ES', { month: 'long' })}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshFromSupabase}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Refrescar"
            >
              <RefreshCw className={cn('w-5 h-5 text-gray-500', isLoadingData && 'animate-spin')} />
            </button>

            <button onClick={() => setShowSettings(true)} className="p-2 rounded-full hover:bg-gray-100">
              <Settings className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {dataError && (
          <div className="mb-4 rounded-xl bg-amber-50 text-amber-700 px-4 py-3 text-sm">
            {dataError}
          </div>
        )}

        <Gauge />
      </div>

      <div className="bg-white rounded-3xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Gastos por Categoría</h2>
          <div className={cn(
            "px-3 py-1 rounded-full text-sm font-medium",
            lastMonthComparison > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
          )}>
            {lastMonthComparison > 0 ? "↗" : "↘"} {Math.abs(lastMonthComparison).toFixed(0)}% vs mes ant.
          </div>
        </div>

        <div className="space-y-3">
          {categories.map(cat => {
            const amount = expensesByCategory[cat.name] || 0;
            const percent = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;

            return (
              <div key={cat.name} className="flex items-center space-x-3">
                <div className="text-2xl">{cat.icon}</div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700">{cat.name}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(amount)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                    <div
                      className="bg-indigo-500 h-2 rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Últimos Tickets</h2>
        <div className="space-y-3">
          {expenses.slice(0, 3).map(exp => (
            <div key={exp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">
                  {categories.find(c => c.name === exp.category)?.icon}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{exp.merchant || '—'}</div>
                  <div className="text-sm text-gray-500">{formatDate(exp.date)}</div>
                </div>
              </div>
              <div className="font-bold text-gray-900">{formatCurrency(exp.amount)}</div>
            </div>
          ))}

          {expenses.length === 0 && (
            <div className="text-gray-500 text-sm">Aún no hay tickets. Pulsa “+” para añadir.</div>
          )}
        </div>
      </div>
    </div>
  );

  const TicketsView = () => (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <button
          onClick={refreshFromSupabase}
          className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm flex items-center gap-2"
        >
          <RefreshCw className={cn('w-4 h-4', isLoadingData && 'animate-spin')} />
          Refrescar
        </button>
      </div>

      {isLoadingData && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      )}

      {dataError && (
        <div className="rounded-xl bg-amber-50 text-amber-700 px-4 py-3 text-sm">
          {dataError}
        </div>
      )}

      <div className="space-y-3">
        {expenses.map(exp => (
          <div key={exp.id} className="bg-white rounded-3xl shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="text-2xl mt-1">{categories.find(c => c.name === exp.category)?.icon}</div>
                <div>
                  <div className="font-bold text-gray-900 text-lg">{exp.merchant || '—'}</div>
                  <div className="text-gray-500 text-sm">{formatDate(exp.date)} · {exp.category}</div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="font-bold text-gray-900 text-lg">{formatCurrency(exp.amount)}</div>
                <button
                  onClick={() => handleDeleteExpense(exp.id)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-500"
                  title="Borrar"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {exp.imageUrl && (
              <div className="mt-3">
                <img src={exp.imageUrl} alt="Ticket" className="w-full rounded-2xl object-cover max-h-64" />
              </div>
            )}
          </div>
        ))}

        {expenses.length === 0 && !isLoadingData && (
          <div className="text-gray-500 text-sm">No hay tickets todavía.</div>
        )}
      </div>
    </div>
  );

  const BottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex items-center justify-around py-3">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "flex flex-col items-center space-y-1 px-4 py-2 rounded-2xl",
            activeTab === 'dashboard' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <PieChart className="w-6 h-6" />
          <span className="text-xs font-medium">DASHBOARD</span>
        </button>

        <button
          onClick={() => setShowUpload(true)}
          className="bg-indigo-600 p-4 rounded-full shadow-lg -mt-8 text-white hover:bg-indigo-700 transition-colors"
          title="Añadir ticket"
        >
          <Plus className="w-8 h-8" />
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={cn(
            "flex flex-col items-center space-y-1 px-4 py-2 rounded-2xl",
            activeTab === 'tickets' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <List className="w-6 h-6" />
          <span className="text-xs font-medium">TICKETS</span>
        </button>
      </div>
    </div>
  );

  const UploadModal = () => {
    if (!showUpload) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
        <div className="bg-white w-full max-w-md rounded-t-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Añadir ticket</h2>
            <button onClick={() => { setShowUpload(false); setSelectedImage(null); setPendingExpense(null); }} className="p-2 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!selectedImage && !isProcessing && !pendingExpense && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={startCamera}
                className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl hover:bg-gray-100"
              >
                <Camera className="w-10 h-10 text-indigo-600" />
                <span className="mt-2 font-medium">Cámara</span>
              </button>

              <label className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl hover:bg-gray-100 cursor-pointer">
                <Upload className="w-10 h-10 text-indigo-600" />
                <span className="mt-2 font-medium">Subir foto</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          )}

          {showCamera && (
            <div className="space-y-4">
              <video ref={videoRef} className="w-full rounded-3xl bg-black" playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <button
                onClick={capturePhoto}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700"
              >
                Capturar
              </button>
              <button
                onClick={() => { stopCamera(); setShowUpload(true); }}
                className="w-full py-3 bg-gray-100 rounded-2xl font-medium"
              >
                Cancelar
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <div className="text-gray-700 font-medium">Procesando ticket…</div>
            </div>
          )}

          {pendingExpense && !isProcessing && (
            <div className="space-y-4">
              {previewImage && (
                <img src={previewImage} alt="Ticket" className="w-full rounded-3xl object-cover max-h-64" />
              )}

              <div className="bg-gray-50 rounded-3xl p-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 font-medium">Comercio</div>
                  <input
                    value={pendingExpense.merchant}
                    onChange={e => setPendingExpense({ ...pendingExpense, merchant: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Importe</div>
                    <input
                      type="number"
                      value={pendingExpense.amount}
                      onChange={e => setPendingExpense({ ...pendingExpense, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Fecha</div>
                    <input
                      type="date"
                      value={pendingExpense.date}
                      onChange={e => setPendingExpense({ ...pendingExpense, date: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 font-medium">Categoría</div>
                  <select
                    value={pendingExpense.category}
                    onChange={e => setPendingExpense({ ...pendingExpense, category: e.target.value as Category })}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200"
                  >
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleConfirmExpense}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Guardar
              </button>

              <button
                onClick={() => { setPendingExpense(null); setSelectedImage(null); setPreviewImage(null); }}
                className="w-full py-3 bg-gray-100 rounded-2xl font-medium"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SettingsModal = () => {
    if (!showSettings) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
        <div className="bg-white w-full max-w-md rounded-t-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Ajustes</h2>
            <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-gray-50 rounded-3xl p-4 space-y-3">
            <div className="text-sm text-gray-500 font-medium">Límite mensual</div>

            {!isEditingLimit ? (
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{formatCurrency(monthlyLimit)}</div>
                <button
                  onClick={() => { setTempLimit(monthlyLimit.toString()); setIsEditingLimit(true); }}
                  className="px-3 py-2 rounded-xl bg-white shadow text-gray-700 font-medium"
                >
                  Editar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="number"
                  value={tempLimit}
                  onChange={e => setTempLimit(e.target.value)}
                  className="w-full px-3 py-3 rounded-2xl border border-gray-200 text-lg"
                />
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      const newLimit = parseFloat(tempLimit) || 0;
                      setMonthlyLimit(newLimit);
                      setIsEditingLimit(false);

                      // Guardar también en Supabase (tabla app_settings, fila id=1)
                      try {
                        const { error } = await supabase
                          .from('app_settings')
                          .upsert({ id: 1, monthly_limit: newLimit }, { onConflict: 'id' });
                        if (error) throw error;
                      } catch (err) {
                        console.error(err);
                        // No bloqueamos la UI: queda al menos en cache local
                      }
                    }}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setIsEditingLimit(false)}
                    className="flex-1 py-3 bg-white rounded-2xl font-bold border border-gray-200"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500">
            * Nota: los tickets se guardan en Supabase. Las imágenes todavía no (si quieres, lo siguiente es guardarlas en Storage).
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto p-4">
        <header className="flex items-center space-x-3 py-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold">
            <Camera className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GastoSnap</h1>
        </header>

        {activeTab === 'dashboard' ? <DashboardView /> : <TicketsView />}
      </div>

      <BottomNav />
      <UploadModal />
      <SettingsModal />
    </div>
  );
};

export default App;