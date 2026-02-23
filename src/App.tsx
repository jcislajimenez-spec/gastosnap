import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, PieChart as PieChartIcon, List, Loader2, Check, X, Trash2, Settings, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ComposedChart } from 'recharts';
import { format, parseISO, isSameMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseReceipt, ReceiptData } from './services/gemini';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { LogOut, Download, Mail, Lock, UserPlus, LogIn } from 'lucide-react';

export interface Expense {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
  imageUrl?: string;
  createdAt: string;
  userName: string;
}

const CATEGORY_COLORS: Record<string, { color: string; icon: string }> = {
  'Alimentación': { color: '#10b981', icon: '🍽️' },
  'Restaurantes': { color: '#f59e0b', icon: '🍕' },
  'Transporte': { color: '#3b82f6', icon: '🚗' },
  'Ocio': { color: '#8b5cf6', icon: '🎉' },
  'Suministros': { color: '#06b6d4', icon: '💡' },
  'Compras': { color: '#ec4899', icon: '🛍️' },
  'Salud': { color: '#ef4444', icon: '🏥' },
  'Educación': { color: '#f97316', icon: '📚' },
  'Hogar': { color: '#14b8a6', icon: '🏠' },
  'Mascotas': { color: '#a855f7', icon: '🐾' },
  'Viajes': { color: '#0ea5e9', icon: '✈️' },
  'Seguros': { color: '#64748b', icon: '🛡️' },
  'Tecnología': { color: '#84cc16', icon: '💻' },
  'Otros': { color: '#9ca3af', icon: '📦' },
};

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthlyLimit, setMonthlyLimit] = useState<number>(1250);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string>(() => {
    return localStorage.getItem('gastosnap_user_name') || '';
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingExpense, setPendingExpense] = useState<ReceiptData | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');
  
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState(monthlyLimit.toString());
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carga inicial desde Supabase
  useEffect(() => {
    if (!currentUser) return;
    
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        const { data: tickets, error: ticketsError } = await supabase
          .from('tickets')
          .select('*')
          .order('date', { ascending: false });
          
        if (ticketsError) throw ticketsError;
        
        if (tickets) {
          const mappedExpenses: Expense[] = tickets.map(t => ({
            id: t.id,
            merchant: t.description || '',
            amount: Number(t.amount),
            date: t.date,
            category: t.category || 'Otros',
            createdAt: t.created_at,
            userName: t.user_name || 'Principal'
          }));
          setExpenses(mappedExpenses);
        }

        const { data: settings, error: settingsError } = await supabase
          .from('app_settings')
          .select('monthly_limit')
          .eq('id', 1)
          .maybeSingle();
          
        if (!settingsError && settings) {
          setMonthlyLimit(Number(settings.monthly_limit));
        }
      } catch (error) {
        console.error('Error loading data from Supabase:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentUser]);

  const handleSetUser = (name: string) => {
    const cleanName = name.trim();
    if (cleanName) {
      setCurrentUser(cleanName);
      localStorage.setItem('gastosnap_user_name', cleanName);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = expenses.map(e => ({
      'Quién': e.userName,
      'Establecimiento': e.merchant,
      'Importe (€)': e.amount,
      'Fecha': e.date,
      'Categoría': e.category,
      'Fecha Registro': format(parseISO(e.createdAt), 'dd/MM/yyyy HH:mm')
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gastos Isla Gasto");
    
    // Ajustar anchos de columna básicos
    const wscols = [
      {wch: 15}, {wch: 25}, {wch: 12}, {wch: 12}, {wch: 15}, {wch: 20}
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `IslaGasto_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const objectUrl = URL.createObjectURL(file);
      setPreviewImage(objectUrl);

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
          const data = await parseReceipt(base64String, file.type);
          setPendingExpense(data);
        } catch (error) {
          alert('No he podido leer el ticket automáticamente. Por favor, introduce los datos tú mismo.');
          setPendingExpense({
            merchant: '',
            amount: 0,
            date: format(new Date(), 'yyyy-MM-dd'),
            category: 'Otros'
          });
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      setPreviewImage(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmExpense = async () => {
    if (!pendingExpense) return;
    
    try {
      setIsProcessing(true);
      
      const { data, error } = await supabase
        .from('tickets')
        .insert([{
          description: pendingExpense.merchant,
          amount: pendingExpense.amount,
          date: pendingExpense.date,
          category: pendingExpense.category,
          user_name: currentUser
        }])
        .select()
        .single();

      if (error) throw error;

      const newExpense: Expense = {
        id: data.id,
        merchant: data.description,
        amount: Number(data.amount),
        date: data.date,
        category: data.category,
        imageUrl: previewImage || undefined,
        createdAt: data.created_at,
        userName: data.user_name
      };
      
      setExpenses(prev => [newExpense, ...prev]);
      setPendingExpense(null);
      setPreviewImage(null);
    } catch (error) {
      console.error('Error saving to Supabase:', error);
      alert('Error al guardar en la nube. Comprueba tu conexión.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelExpense = () => {
    setPendingExpense(null);
    setPreviewImage(null);
  };

  const handleDeleteExpense = async (id: string) => {
    // Eliminamos de Supabase
    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('Error deleting from Supabase:', error);
      // Si falla, al menos lo quitamos de la UI y el usuario lo intentará luego
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
  };

  // Datos derivados
  const currentMonth = new Date();
  const previousMonth = subMonths(currentMonth, 1);
  
  const currentMonthExpenses = expenses.filter(e => {
    try { return isSameMonth(parseISO(e.date), currentMonth); } catch { return false; }
  });
  
  const previousMonthExpenses = expenses.filter(e => {
    try { return isSameMonth(parseISO(e.date), previousMonth); } catch { return false; }
  });

  const totalCurrentMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPreviousMonth = previousMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const percentChange = totalPreviousMonth === 0 
    ? (totalCurrentMonth > 0 ? 100 : 0) 
    : ((totalCurrentMonth - totalPreviousMonth) / totalPreviousMonth) * 100;

  const isOverLimit = totalCurrentMonth > monthlyLimit;
  
  // Datos para el histórico (últimos 6 meses)
  const historyData = Array.from({ length: 6 }).map((_, i) => {
    const monthDate = subMonths(currentMonth, i);
    const monthExpenses = expenses.filter(e => {
      try { return isSameMonth(parseISO(e.date), monthDate); } catch { return false; }
    });
    const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    return {
      name: format(monthDate, 'MMM', { locale: es }),
      total,
      date: monthDate
    };
  }).reverse();

  const expensesByCategory = currentMonthExpenses.reduce((acc, expense) => {
    const cat = expense.category || 'Otros';
    acc[cat] = (acc[cat] || 0) + expense.amount;
    return acc;
  }, {} as Record<string, number>);

  const chartData: { name: string; value: number }[] = Object.entries(expensesByCategory)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => b.value - a.value);

  // Datos para el velocímetro (Gauge)
  // Queremos que el 100% sea el límite, pero mostrar un poco más si se pasa
  const gaugeMax = Math.max(monthlyLimit * 1.2, totalCurrentMonth);
  const gaugeData = [
    { name: 'Gastado', value: totalCurrentMonth },
    { name: 'Restante', value: Math.max(0, gaugeMax - totalCurrentMonth) },
  ];
  
  const gaugeColor = isOverLimit ? '#ef4444' : '#6366f1';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Cabecera */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Camera size={18} />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Isla Gasto</h1>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded border border-slate-100">
                {currentUser}
              </span>
              <button 
                onClick={() => {
                  localStorage.removeItem('gastosnap_user_name');
                  setCurrentUser('');
                }}
                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                title="Cambiar Usuario"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {!currentUser ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 mt-10"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
                <Camera size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">¿Quién eres?</h2>
              <p className="text-slate-500 text-sm mt-2">Introduce tu nombre para empezar</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => handleSetUser('Juan Carlos')}
                className="py-6 bg-indigo-50 text-indigo-700 rounded-2xl font-bold border-2 border-indigo-100 hover:bg-indigo-100 transition-all flex flex-col items-center justify-center gap-2"
              >
                <span className="text-3xl">👨‍💼</span> Juan Carlos
              </button>
              <button 
                onClick={() => handleSetUser('Itziar')}
                className="py-6 bg-pink-50 text-pink-700 rounded-2xl font-bold border-2 border-pink-100 hover:bg-pink-100 transition-all flex flex-col items-center justify-center gap-2"
              >
                <span className="text-3xl">👩‍💼</span> Itziar
              </button>
            </div>
            
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-bold">O pon otro nombre</span></div>
            </div>

            <input 
              type="text" 
              placeholder="Escribe tu nombre..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSetUser((e.target as HTMLInputElement).value);
              }}
            />
          </motion.div>
        ) : activeTab === 'dashboard' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Tarjeta de Límite (Velocímetro) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Estado del Límite</p>
                  <h2 className="text-xl font-semibold text-slate-800">
                    {format(currentMonth, 'MMMM', { locale: es })}
                  </h2>
                </div>
                <button 
                  onClick={() => setIsEditingLimit(true)}
                  className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <Settings size={16} />
                </button>
              </div>

              <div className="flex flex-col items-center justify-center py-4">
                <div className="h-48 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gaugeData}
                        cx="50%"
                        cy="100%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={85}
                        outerRadius={115}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill={gaugeColor} />
                        <Cell fill="#f1f5f9" />
                      </Pie>
                      {/* Marca de Límite (100%) */}
                      <Pie
                        data={[{ value: 1 }]}
                        cx="50%"
                        cy="100%"
                        startAngle={180 - (monthlyLimit / gaugeMax) * 180 + 1}
                        endAngle={180 - (monthlyLimit / gaugeMax) * 180 - 1}
                        innerRadius={80}
                        outerRadius={120}
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={false}
                      >
                        <Cell fill="#1e293b" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
                    <span className="text-3xl font-bold tracking-tight">
                      {totalCurrentMonth.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400 font-medium">Límite:</span>
                      <span className="text-xs text-slate-800 font-bold">{monthlyLimit}€</span>
                    </div>
                  </div>
                  {/* Etiqueta de la marca de límite */}
                  <div 
                    className="absolute text-[10px] font-bold text-slate-800 bg-white px-1 rounded shadow-sm border border-slate-100"
                    style={{ 
                      left: `${50 + 45 * Math.cos((1 - monthlyLimit / gaugeMax) * Math.PI)}%`,
                      top: `${100 - 90 * Math.sin((monthlyLimit / gaugeMax) * Math.PI)}%`,
                      transform: 'translate(-50%, -100%)'
                    }}
                  >
                    LÍMITE
                  </div>
                </div>
                
                {isOverLimit && (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-full text-sm font-bold border border-red-100 shadow-sm"
                  >
                    <AlertCircle size={16} />
                    <span>¡Excedido por {(totalCurrentMonth - monthlyLimit).toFixed(0)}€!</span>
                  </motion.div>
                )}
              </div>

              {isEditingLimit && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-20">
                  <p className="text-sm font-bold text-slate-500 uppercase mb-4">Ajustar Límite Mensual</p>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      value={tempLimit}
                      onChange={(e) => setTempLimit(e.target.value)}
                      className="w-32 text-2xl font-bold text-center border-b-2 border-indigo-600 p-2 focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xl font-bold text-slate-400">€</span>
                  </div>
                  <div className="flex gap-4 mt-8">
                    <button 
                      onClick={() => setIsEditingLimit(false)}
                      className="px-6 py-2 rounded-full text-slate-500 font-medium hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={async () => {
                        const newLimit = parseFloat(tempLimit) || 0;
                        setMonthlyLimit(newLimit);
                        setIsEditingLimit(false);
                        
                        try {
                          await supabase
                            .from('app_settings')
                            .upsert({ id: 1, monthly_limit: newLimit }, { onConflict: 'id' });
                        } catch (error) {
                          console.error('Error updating limit in Supabase:', error);
                        }
                      }}
                      className="px-8 py-2 bg-indigo-600 text-white rounded-full font-bold shadow-lg shadow-indigo-200"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Gráfico de Categorías */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base font-bold text-slate-800">Gastos por Categoría</h2>
                <div className={cn(
                  "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md",
                  percentChange > 0 ? "text-red-600 bg-red-50" : "text-emerald-600 bg-emerald-50"
                )}>
                  {percentChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{Math.abs(percentChange).toFixed(0)}% vs mes ant.</span>
                </div>
              </div>
              
              {chartData.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name]?.color || CATEGORY_COLORS['Otros'].color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string) => [`${value.toFixed(2)} €`, `${CATEGORY_COLORS[name]?.icon || '📦'} ${name}`]}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }}
                        formatter={(value) => `${CATEGORY_COLORS[value]?.icon || '📦'} ${value}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <PieChartIcon className="text-slate-300" size={24} />
                  </div>
                  <p className="text-slate-500">Sin gastos registrados este mes.</p>
                </div>
              )}
            </div>

            {/* Gráfico Histórico con Línea de Límite */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-base font-bold text-slate-800 mb-6">Histórico y Tendencia</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis hide />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(0)} €`, 'Gasto']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar 
                      dataKey="total" 
                      radius={[4, 4, 0, 0]} 
                      barSize={30}
                    >
                      {historyData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={isSameMonth(entry.date, currentMonth) ? '#6366f1' : '#e2e8f0'} 
                        />
                      ))}
                    </Bar>
                    <ReferenceLine 
                      y={monthlyLimit} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      label={{ 
                        position: 'right', 
                        value: `Límite: ${monthlyLimit}€`, 
                        fill: '#ef4444', 
                        fontSize: 10,
                        fontWeight: 'bold'
                      }} 
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex justify-between items-center px-1">
              <h2 className="text-lg font-bold text-slate-800">Listado de Gastos</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleExportExcel}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors"
                >
                  <Download size={14} />
                  Excel
                </button>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                  {expenses.length} tickets
                </span>
              </div>
            </div>
            
            {expenses.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 font-medium">No hay gastos registrados todavía.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <motion.div 
                    layout
                    key={expense.id} 
                    className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 grid grid-cols-[auto_1fr_auto] items-center gap-4 group"
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: CATEGORY_COLORS[expense.category]?.color || CATEGORY_COLORS['Otros'].color }}
                    >
                      <span className="text-lg">{CATEGORY_COLORS[expense.category]?.icon || '📦'}</span>
                    </div>
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 truncate">{expense.merchant}</p>
                        <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-1 rounded border border-indigo-100 shrink-0">
                          {expense.userName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        <span className="truncate max-w-[80px]">{expense.category}</span>
                        <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                        <span className="shrink-0">{format(parseISO(expense.date), 'dd MMM yyyy', { locale: es })}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-slate-900 text-right min-w-[60px]">
                        {expense.amount.toFixed(2)}€
                      </span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteExpense(expense.id);
                        }}
                        className="w-9 h-9 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-90"
                        aria-label="Eliminar gasto"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>


      {/* Navegación Inferior */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 pb-safe z-30">
        <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-around relative">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex flex-col items-center justify-center w-16 h-full gap-1 transition-all",
              activeTab === 'dashboard' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <PieChartIcon size={20} className={activeTab === 'dashboard' ? "scale-110" : ""} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Dashboard</span>
          </button>
          
          <div className="w-16"></div>

          <button 
            onClick={() => setActiveTab('list')}
            className={cn(
              "flex flex-col items-center justify-center w-16 h-full gap-1 transition-all",
              activeTab === 'list' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <List size={20} className={activeTab === 'list' ? "scale-110" : ""} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Tickets</span>
          </button>

          <div className="absolute left-1/2 -top-6 -translate-x-1/2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-200 flex items-center justify-center hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all border-4 border-white"
            >
              <Plus size={28} />
            </button>
          </div>
        </div>
      </div>

      {/* Input de archivo oculto */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Modal de Procesamiento / Confirmación */}
      <AnimatePresence>
        {(isProcessing || pendingExpense) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              {isProcessing ? (
                <div className="p-10 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-100 rounded-full" />
                    <Loader2 className="w-20 h-20 text-indigo-600 animate-spin absolute inset-0" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Analizando ticket...</h3>
                    <p className="text-sm text-slate-500 mt-2">Nuestra IA está leyendo los detalles de tu compra.</p>
                  </div>
                </div>
              ) : pendingExpense ? (
                <div className="flex flex-col max-h-[85vh]">
                  <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Confirmar Ticket</h3>
                    <button onClick={handleCancelExpense} className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-slate-400 hover:text-slate-600">
                      <X size={18} />
                    </button>
                  </div>
                  
                  <div className="p-6 space-y-5 overflow-y-auto">
                    {previewImage && (
                      <div className="w-full h-40 bg-slate-100 rounded-2xl overflow-hidden shadow-inner">
                        <img src={previewImage} alt="Ticket" className="w-full h-full object-cover" />
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Establecimiento</label>
                        <input 
                          type="text" 
                          value={pendingExpense.merchant}
                          onChange={(e) => setPendingExpense({...pendingExpense, merchant: e.target.value})}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Importe (€)</label>
                          <input 
                            type="number" 
                            step="0.01"
                            value={pendingExpense.amount}
                            onChange={(e) => setPendingExpense({...pendingExpense, amount: parseFloat(e.target.value) || 0})}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fecha</label>
                          <input 
                            type="date" 
                            value={pendingExpense.date}
                            onChange={(e) => setPendingExpense({...pendingExpense, date: e.target.value})}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Categoría</label>
                        <select 
                          value={pendingExpense.category}
                          onChange={(e) => setPendingExpense({...pendingExpense, category: e.target.value})}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none"
                        >
                          {Object.keys(CATEGORY_COLORS).map(cat => (
                            <option key={cat} value={cat}>{CATEGORY_COLORS[cat].icon} {cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-5 border-t border-slate-100 grid grid-cols-2 gap-4 bg-slate-50">
                    <button 
                      onClick={handleCancelExpense}
                      className="px-4 py-3 rounded-2xl font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      Descartar
                    </button>
                    <button 
                      onClick={handleConfirmExpense}
                      className="px-4 py-3 rounded-2xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                    >
                      <Check size={20} />
                      Confirmar
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
