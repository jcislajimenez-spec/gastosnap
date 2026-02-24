import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, PieChart as PieChartIcon, List, Loader2, Check, X, Trash2, Settings, TrendingUp, TrendingDown, AlertCircle, LogOut, Download, Image as ImageIcon, UserPlus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ComposedChart, LabelList } from 'recharts';
import { format, parseISO, isSameMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseReceipt, ReceiptData } from './services/gemini';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';

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
  const [monthlyLimit, setMonthlyLimit] = useState<number>(() => {
    const saved = localStorage.getItem('gastosnap_limit');
    return saved ? Number(saved) : 1250;
  });
  const [isLoading, setIsLoading] = useState(true);
  
  // Gestión de Usuarios
  const [currentUser, setCurrentUser] = useState<string>(() => localStorage.getItem('gastosnap_user_name') || '');
  const [familyMembers, setFamilyMembers] = useState<string[]>(() => {
    const saved = localStorage.getItem('gastosnap_family');
    return saved ? JSON.parse(saved) : ['Juan Carlos', 'Itziar'];
  });
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingExpense, setPendingExpense] = useState<ReceiptData | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState(monthlyLimit.toString());
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    const loadData = async () => {
      try {
        setIsLoading(true);
        const { data: tickets, error: ticketsError } = await supabase
          .from('tickets').select('*').order('date', { ascending: false });
        if (ticketsError) throw ticketsError;
        if (tickets) {
          setExpenses(tickets.map(t => ({
            id: t.id, 
            merchant: t.description || '', 
            amount: Number(t.amount),
            date: t.date, 
            category: t.category || 'Otros', 
            createdAt: t.created_at,
            userName: t.user_name || 'Principal'
          })));
        }
        const { data: settings } = await supabase.from('app_settings').select('monthly_limit').eq('id', 1).maybeSingle();
        if (settings) {
          const limit = Number(settings.monthly_limit);
          setMonthlyLimit(limit);
          localStorage.setItem('gastosnap_limit', limit.toString());
        }
      } catch (e) {
        console.error(e);
      } finally { setIsLoading(false); }
    };
    loadData();
  }, [currentUser]);

  const handleSetUser = (name: string) => {
    setCurrentUser(name);
    localStorage.setItem('gastosnap_user_name', name);
  };

  const handleAddMember = () => {
    if (newUserName.trim() && familyMembers.length < 10) {
      const updated = [...familyMembers, newUserName.trim()];
      setFamilyMembers(updated);
      localStorage.setItem('gastosnap_family', JSON.stringify(updated));
      setNewUserName('');
      setShowAddUser(false);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = expenses.map(e => ({
      'Usuario': e.userName,
      'Establecimiento': e.merchant,
      'Importe (€)': e.amount,
      'Fecha': e.date,
      'Categoría': e.category,
      'Fecha Registro': format(parseISO(e.createdAt), 'dd/MM/yyyy HH:mm')
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gastos");
    XLSX.writeFile(workbook, `IslaGasto_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowPhotoMenu(false);
    setIsProcessing(true);
    setPreviewImage(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const data = await parseReceipt(base64, file.type);
        setPendingExpense(data);
      } catch (err) {
        setPendingExpense({ merchant: '', amount: 0, date: format(new Date(), 'yyyy-MM-dd'), category: 'Otros' });
      } finally { setIsProcessing(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmExpense = async () => {
    if (!pendingExpense) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.from('tickets').insert([{
        description: pendingExpense.merchant, 
        amount: pendingExpense.amount,
        date: pendingExpense.date, 
        category: pendingExpense.category,
        user_name: currentUser
      }]).select().single();
      if (error) throw error;
      setExpenses(prev => [{ 
        id: data.id, 
        merchant: data.description, 
        amount: Number(data.amount), 
        date: data.date, 
        category: data.category, 
        createdAt: data.created_at,
        userName: data.user_name
      }, ...prev]);
      setPendingExpense(null); setPreviewImage(null);
    } catch (e) { alert('Error al guardar'); } finally { setIsProcessing(false); }
  };

  const handleDeleteExpense = async (id: string) => {
    await supabase.from('tickets').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const currentMonth = new Date();
  const currentMonthExpenses = expenses.filter(e => isSameMonth(parseISO(e.date), currentMonth));
  const totalCurrentMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const isOverLimit = totalCurrentMonth > monthlyLimit;
  
  const historyData = Array.from({ length: 6 }).map((_, i) => {
    const d = subMonths(currentMonth, i);
    const total = expenses.filter(e => isSameMonth(parseISO(e.date), d)).reduce((s, e) => s + e.amount, 0);
    return { name: format(d, 'MMM', { locale: es }), total, date: d };
  }).reverse();

  const chartData = Object.entries(currentMonthExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount; return acc;
  }, {} as Record<string, number>)).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value);

  const gaugeMax = Math.max(monthlyLimit * 1.2, totalCurrentMonth);
  const gaugeData = [{ value: totalCurrentMonth }, { value: Math.max(0, gaugeMax - totalCurrentMonth) }];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
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
              <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded border border-slate-100">{currentUser}</span>
              <button onClick={() => { setCurrentUser(''); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><LogOut size={16} /></button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {!currentUser ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 mt-10">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4"><Camera size={32} /></div>
              <h2 className="text-2xl font-bold text-slate-800">¿Quién eres?</h2>
              <p className="text-slate-500 text-sm mt-2">Selecciona tu perfil para empezar</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {familyMembers.map(member => (
                <button 
                  key={member}
                  onClick={() => handleSetUser(member)} 
                  className="py-6 bg-indigo-50 text-indigo-700 rounded-2xl font-bold border-2 border-indigo-100 hover:bg-indigo-100 flex flex-col items-center gap-2"
                >
                  <span className="text-3xl">{member === 'Juan Carlos' ? '👨‍💼' : member === 'Itziar' ? '👩‍💼' : '👤'}</span> 
                  {member}
                </button>
              ))}
              {familyMembers.length < 10 && (
                <button 
                  onClick={() => setShowAddUser(true)}
                  className="py-6 bg-slate-50 text-slate-500 rounded-2xl font-bold border-2 border-dashed border-slate-200 hover:bg-slate-100 flex flex-col items-center gap-2"
                >
                  <UserPlus size={24} />
                  Nuevo
                </button>
              )}
            </div>

            <AnimatePresence>
              {showAddUser && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-6 pt-6 border-t border-slate-100 overflow-hidden">
                  <input 
                    type="text" 
                    placeholder="Nombre del nuevo usuario..." 
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mb-3" 
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddUser(false)} className="flex-1 py-3 text-slate-400 font-bold">Cancelar</button>
                    <button onClick={handleAddMember} className="flex-2 py-3 bg-indigo-600 text-white rounded-xl font-bold px-6">Agregar</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : activeTab === 'dashboard' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border relative">
              <div className="flex justify-between mb-2">
                <div><p className="text-xs font-bold text-slate-400 uppercase">Límite Mensual</p><h2 className="text-xl font-bold">{format(currentMonth, 'MMMM', { locale: es })}</h2></div>
                <button onClick={() => setIsEditingLimit(true)} className="p-2 bg-slate-50 rounded-full text-slate-400"><Settings size={16} /></button>
              </div>
              <div className="h-48 w-full relative">
                <ResponsiveContainer><PieChart>
                  <Pie data={gaugeData} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={80} outerRadius={110} dataKey="value" stroke="none">
                    <Cell fill={isOverLimit ? '#ef4444' : '#6366f1'} /><Cell fill="#f1f5f9" />
                  </Pie>
                  <Pie data={[{v:1}]} cx="50%" cy="100%" startAngle={180-(monthlyLimit/gaugeMax)*180+2} endAngle={180-(monthlyLimit/gaugeMax)*180-2} innerRadius={75} outerRadius={115} dataKey="v" stroke="none">
                    <Cell fill="#ef4444" /> {/* MARCA ROJA MÁS ANCHA */}
                  </Pie>
                </PieChart></ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
                  <span className="text-3xl font-bold">{totalCurrentMonth.toFixed(0)}€</span>
                  <span className="text-xs text-slate-400">Límite: {monthlyLimit}€</span>
                </div>
              </div>
              {isOverLimit && <div className="mt-4 text-center text-red-600 bg-red-50 py-2 rounded-full text-xs font-bold">¡Límite superado!</div>}
              {isEditingLimit && (
                <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center p-6 z-20">
                  <input type="number" value={tempLimit} onChange={e => setTempLimit(e.target.value)} className="text-3xl font-bold text-center border-b-2 border-indigo-600 w-32 mb-6 focus:outline-none" />
                  <div className="flex gap-4">
                    <button onClick={() => setIsEditingLimit(false)} className="px-4 py-2 text-slate-400">Cancelar</button>
                    <button onClick={async () => { 
                      const newLimit = Number(tempLimit);
                      setMonthlyLimit(newLimit); 
                      localStorage.setItem('gastosnap_limit', newLimit.toString());
                      setIsEditingLimit(false); 
                      await supabase.from('app_settings').upsert({ id: 1, monthly_limit: newLimit }); 
                    }} className="px-6 py-2 bg-indigo-600 text-white rounded-full font-bold">Guardar</button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border">
              <h2 className="font-bold mb-4">Por Categoría</h2>
              <div className="h-64"><ResponsiveContainer><PieChart>
                <Pie data={chartData} innerRadius={60} outerRadius={80} dataKey="value">
                  {chartData.map((e, i) => <Cell key={i} fill={CATEGORY_COLORS[e.name]?.color || '#9ca3af'} />)}
                </Pie>
                <Tooltip formatter={(v:number, n:string) => [`${v.toFixed(2)}€`, `${CATEGORY_COLORS[n]?.icon} ${n}`]} />
                <Legend formatter={v => `${CATEGORY_COLORS[v]?.icon} ${v}`} />
              </PieChart></ResponsiveContainer></div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border">
              <h2 className="font-bold mb-4">Histórico Mensual</h2>
              <div className="h-64"><ResponsiveContainer><ComposedChart data={historyData} margin={{ top: 40, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:10, fontWeight: 'bold'}} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize:10, fill: '#94a3b8'}} 
                  tickFormatter={(v) => `${v}€`}
                  domain={[0, Math.max(monthlyLimit * 1.2, ...historyData.map(d => d.total + 200))]}
                />
                <Tooltip formatter={(v:number) => [`${v}€`, 'Gasto']} />
                <Bar dataKey="total" fill="#e2e8f0" radius={[4,4,0,0]} barSize={30}>
                  {historyData.map((e, i) => <Cell key={i} fill={isSameMonth(e.date, currentMonth) ? '#6366f1' : '#cbd5e1'} />)}
                  <LabelList dataKey="total" position="top" formatter={(v:number) => `${v.toFixed(0)}€`} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} />
                </Bar>
                <ReferenceLine 
                  y={monthlyLimit} 
                  stroke="#ef4444" 
                  strokeDasharray="4 4" 
                  strokeWidth={2}
                  label={{
                    value: `LÍMITE: ${monthlyLimit}€`, 
                    position: 'top', 
                    fill: '#ef4444', 
                    fontSize: 11, 
                    fontWeight: 'bold',
                    offset: 15
                  }} 
                />
              </ComposedChart></ResponsiveContainer></div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Mis Tickets</h2>
              <button onClick={handleExportExcel} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-md flex items-center gap-1"><Download size={14}/>Excel</button>
            </div>
            {expenses.map(e => (
              <div key={e.id} className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{backgroundColor: CATEGORY_COLORS[e.category]?.color + '20'}}>{CATEGORY_COLORS[e.category]?.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold truncate">{e.merchant}</p>
                    <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-1 rounded border border-indigo-100 shrink-0">{e.userName}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">{e.category} • {format(parseISO(e.date), 'dd MMM')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold">{e.amount.toFixed(2)}€</span>
                  <button onClick={() => handleDeleteExpense(e.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t h-16 flex items-center justify-around z-30">
        <button onClick={() => setActiveTab('dashboard')} className={cn("flex flex-col items-center gap-1", activeTab==='dashboard' ? "text-indigo-600" : "text-slate-400")}><PieChartIcon size={20}/><span className="text-[10px] font-bold">DASHBOARD</span></button>
        <div className="w-12"></div>
        <button onClick={() => setActiveTab('list')} className={cn("flex flex-col items-center gap-1", activeTab==='list' ? "text-indigo-600" : "text-slate-400")}><List size={20}/><span className="text-[10px] font-bold">TICKETS</span></button>
        <button onClick={() => setShowPhotoMenu(true)} className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center border-4 border-white"><Plus size={28}/></button>
      </nav>

      {/* Menú de Opciones de Foto */}
      <AnimatePresence>
        {showPhotoMenu && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center p-4" onClick={() => setShowPhotoMenu(false)}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-white w-full max-w-md rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-center text-slate-800 mb-2">Añadir Ticket</h3>
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg"
              >
                <Camera size={24} /> Hacer Foto
              </button>
              <button 
                onClick={() => galleryInputRef.current?.click()}
                className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-3"
              >
                <ImageIcon size={24} /> Subir de Galería
              </button>
              <button onClick={() => setShowPhotoMenu(false)} className="w-full py-3 text-slate-400 font-bold">Cancelar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
      <input type="file" ref={galleryInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      <AnimatePresence>
        {(isProcessing || pendingExpense) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden">
              {isProcessing ? (
                <div className="p-10 text-center space-y-4"><Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" /><p className="font-bold">Analizando ticket...</p></div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center"><h3 className="font-bold">Confirmar Ticket</h3><button onClick={() => setPendingExpense(null)}><X/></button></div>
                  {previewImage && <img src={previewImage} className="w-full h-32 object-cover rounded-xl" />}
                  <div className="space-y-3">
                    <input type="text" value={pendingExpense?.merchant} onChange={e => setPendingExpense({...pendingExpense!, merchant: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold" placeholder="Comercio" />
                    <div className="flex gap-2">
                      <input type="number" value={pendingExpense?.amount} onChange={e => setPendingExpense({...pendingExpense!, amount: Number(e.target.value)})} className="w-1/2 p-3 bg-slate-50 border rounded-xl font-bold" />
                      <input type="date" value={pendingExpense?.date} onChange={e => setPendingExpense({...pendingExpense!, date: e.target.value})} className="w-1/2 p-3 bg-slate-50 border rounded-xl font-bold" />
                    </div>
                    <select value={pendingExpense?.category} onChange={e => setPendingExpense({...pendingExpense!, category: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold">
                      {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{CATEGORY_COLORS[c].icon} {c}</option>)}
                    </select>
                  </div>
                  <button onClick={handleConfirmExpense} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"><Check/> Confirmar</button>
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
