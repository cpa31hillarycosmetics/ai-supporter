import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Camera, 
  RefreshCcw, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ExternalLink, 
  Lightbulb, 
  History, 
  ArrowLeft, 
  Loader2, 
  Home, 
  User, 
  Save,
  ShoppingBag,
  Database
} from 'lucide-react';

// --- НАЛАШТУВАННЯ SUPABASE (від розробника) ---
const SUPABASE_URL = "https://xnedhbqsxrtizvdepdgs.supabase.co";
const SUPABASE_KEY = "sb_publishable_DXW28ftwJV4ZpQQBchJfWw_iv-zs5xk";

// --- НАЛАШТУВАННЯ FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDkWgLdKqBA0fyuWvUUMpzQKiSBAB3O55U",
  authDomain: "hillary-ai-consult.firebaseapp.com",
  projectId: "hillary-ai-consult",
  storageBucket: "hillary-ai-consult.firebasestorage.app",
  messagingSenderId: "760792490149",
  appId: "1:760792490149:web:63eecbc6712c39126a6d4c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'hillary-skin-care-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('welcome');
  const [image, setImage] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [userData, setUserData] = useState({ age: '', skinType: 'не знаю', concerns: '' });
  const [analysis, setAnalysis] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [pastAnalyses, setPastAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState(null);
  
  const apiKey = ""; // Ключ Gemini надається середовищем

  // 1. Ініціалізація Supabase (CDN)
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.async = true;
    script.onload = () => {
      if (window.supabase) {
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        setSupabaseClient(client);
      }
    };
    document.head.appendChild(script);
  }, []);

  // 2. Auth & Firebase (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth init failed", e);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
    });
    return () => unsubscribe();
  }, []);

  // 3. Sync User Data & History
  useEffect(() => {
    if (!user) return;
    
    getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'))
      .then(snap => snap.exists() && setUserData(prev => ({...prev, ...snap.data()})));

    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    const unsubHistory = onSnapshot(historyRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPastAnalyses(items.sort((a, b) => new Date(b.date) - new Date(a.date)));
    }, (err) => setError("Не вдалося завантажити історію. Перевірте з'єднання."));
    
    return () => unsubHistory();
  }, [user]);

  const saveProfile = async (manual = false) => {
    if (!user) return;
    if (manual) setIsProfileSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        ...userData,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("Profile save failed", e);
    } finally {
      if (manual) setIsProfileSaving(false);
    }
  };

  const onPhotoSelected = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError("Файл занадто великий (макс. 10МБ)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(URL.createObjectURL(file));
        setImageMimeType(file.type);
        setBase64Image(event.target.result.split(',')[1]);
        setError(null);
        setStep('questions');
      };
      reader.readAsDataURL(file);
    }
  };

  const runAIAnalysis = async () => {
    if (!base64Image) { setError("Будь ласка, зробіть фото."); return; }
    if (!supabaseClient) { setError("База даних ще ініціалізується. Почекайте секунду."); return; }
    if (!user) { setError("Авторизація... Спробуйте ще раз за мить."); return; }

    setLoading(true);
    setError(null);
    setLoadingProgress(15);
    setLoadingStatus('ШІ вивчає стан шкіри...');
    setStep('analyzing');
    
    saveProfile().catch(() => {});

    try {
      const systemPrompt = `Ти - професійний ШІ-косметолог бренду HiLLARY. 
Аналізуй селфі та анкету. Тобі потрібно визначити тип шкіри, її стан та підібрати 3 найкращі товари Hillary.
Відповідь СУВОРО JSON без зайвих слів:
{
  "is_human_face": true,
  "skin_condition": "детальний аналіз",
  "advice": "порада косметолога",
  "search_keywords": ["назва_товару_1", "назва_товару_2", "назва_товару_3"],
  "skin_type": "тип шкіри"
}`;

      const userMessage = `Вік: ${userData.age}, Тип: ${userData.skinType}, Скарги: ${userData.concerns || 'відсутні'}.`;

      // AI Call (Gemini 2.5 Flash)
      const callAI = async (retries = 0) => {
        const delays = [1000, 2000, 4000, 8000, 16000];
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: userMessage },
                  { inlineData: { mimeType: imageMimeType, data: base64Image } }
                ]
              }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { responseMimeType: "application/json" }
            })
          });

          if (!res.ok) {
            if (retries < 4) {
              await new Promise(r => setTimeout(r, delays[retries]));
              return callAI(retries + 1);
            }
            throw new Error(`AI Error ${res.status}`);
          }
          return await res.json();
        } catch (err) {
          if (retries < 4) {
            await new Promise(r => setTimeout(r, delays[retries]));
            return callAI(retries + 1);
          }
          throw err;
        }
      };

      const result = await callAI();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiText) throw new Error("ШІ не повернув результат.");

      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const parsedResult = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
      
      if (!parsedResult.is_human_face) {
        setError("Ми не впізнали обличчя на фото. Спробуйте інше селфі.");
        setStep('upload');
        setLoading(false);
        return;
      }

      setLoadingProgress(60);
      setLoadingStatus('Шукаємо засоби у базі Hillary...');

      // PARALLEL SEARCH IN SUPABASE (Optimized)
      const searchPromises = parsedResult.search_keywords.map(async (kw) => {
        try {
          const { data } = await supabaseClient
            .from('products')
            .select('id, name, name_uk, description, price, currency, image_url, product_url')
            .eq('brand', 'hillary')
            .ilike('name_uk', `%${kw}%`)
            .limit(1);
          return data && data[0] ? data[0] : null;
        } catch (e) { return null; }
      });

      const foundItems = (await Promise.all(searchPromises)).filter(it => it !== null);

      // Fallback to bestsellers if nothing specific found
      if (foundItems.length === 0) {
        const { data } = await supabaseClient
          .from('products')
          .select('*')
          .eq('brand', 'hillary')
          .eq('is_bestseller', true)
          .limit(3);
        if (data) foundItems.push(...data);
      }

      const finalRecommendations = foundItems.map(p => ({
        id: p.id,
        name: p.name_uk || p.name,
        description: p.description?.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 150) + "...",
        price: p.price,
        link: p.product_url || `https://hillary.ua/search/?search=${encodeURIComponent(p.name_uk || p.name)}`,
        image: p.image_url
      }));

      setAnalysis(parsedResult);
      setRecommendations(finalRecommendations);
      
      // Save to Firebase History (RULE 1)
      const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
      await addDoc(historyRef, {
        date: new Date().toISOString(),
        analysis: parsedResult,
        recommendations: finalRecommendations,
        userPhoto: image
      });
      
      setLoadingProgress(100);
      setTimeout(() => setStep('results'), 300);

    } catch (err) {
      console.error("Analysis Error:", err);
      setError("Збій аналізу. Можливо, мережа нестабільна. Спробуйте ще раз.");
      setStep('questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 max-w-md mx-auto shadow-2xl flex flex-col overflow-hidden relative pb-20">
      
      <header className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-50 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep('welcome')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center -rotate-2 shadow-md">
            <span className="text-white font-black text-sm">H</span>
          </div>
          <span className="font-bold text-lg uppercase text-blue-600 dark:text-blue-400 tracking-tight">HiLLARY AI</span>
        </div>
        <div className="flex items-center gap-3">
            <div title={supabaseClient ? "База активна" : "Підключення..."} className={`w-2.5 h-2.5 rounded-full ${supabaseClient ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-yellow-500 animate-pulse'}`}></div>
            <button onClick={() => setStep('history')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                <History className="w-5 h-5 text-slate-400" />
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {step === 'welcome' && (
          <div className="flex flex-col items-center justify-center min-h-[75vh] p-8 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner border border-blue-100 dark:border-blue-800">
              <Sparkles className="w-12 h-12 text-blue-500" />
            </div>
            <h1 className="text-3xl font-black mb-4 tracking-tight uppercase leading-tight text-slate-800 dark:text-white">Smart Skin<br/>Analysis</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-12 leading-relaxed text-sm font-medium px-4">
                Отримайте персональну програму догляду HiLLARY на основі ШІ аналізу вашої шкіри.
            </p>
            <button onClick={() => setStep('upload')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[2rem] font-bold text-lg shadow-xl shadow-blue-100 dark:shadow-none active:scale-95 transition-all uppercase tracking-wider">Почати розбір</button>
          </div>
        )}

        {step === 'upload' && (
          <div className="p-6 animate-in slide-in-from-right-4">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">Крок 1: Фото</h2>
            <p className="text-slate-500 mb-8 text-sm font-medium">Зробіть селфі без макіяжу при денному світлі.</p>
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] p-16 flex flex-col items-center bg-white dark:bg-slate-900/30 relative cursor-pointer group hover:border-blue-400 transition-colors">
              <input type="file" accept="image/*" capture="user" onChange={onPhotoSelected} className="absolute inset-0 opacity-0 z-10 cursor-pointer" />
              <Camera className="text-blue-500 w-12 h-12 mb-4 group-active:scale-90 transition-transform" />
              <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-widest text-center">Натисніть для фото</span>
            </div>
            {error && <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex gap-2 animate-bounce"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
          </div>
        )}

        {step === 'questions' && (
          <div className="p-6 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setStep('upload')} className="mb-2 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> До фото</button>
            <h2 className="text-2xl font-black uppercase tracking-tight">Крок 2: Анкета</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 ml-1">Ваш Вік</label>
                <input type="number" value={userData.age} className="w-full p-4 rounded-2xl border dark:border-slate-800 dark:bg-slate-950 focus:border-blue-500 outline-none font-bold text-lg" placeholder="25" onChange={(e) => setUserData({...userData, age: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 ml-1">Тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-sm' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 ml-1">Що вас турбує?</label>
                <textarea value={userData.concerns} className="w-full p-4 rounded-2xl border dark:border-slate-800 dark:bg-slate-950 focus:border-blue-500 outline-none font-medium text-sm h-32 resize-none" placeholder="Опишіть скарги (сухість, висипи, зморшки...)" onChange={(e) => setUserData({...userData, concerns: e.target.value})} />
              </div>
              
              {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}

              <button 
                onClick={runAIAnalysis} 
                disabled={!userData.age || loading} 
                className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Аналізувати"}
              </button>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in">
            <div className="relative mb-8">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin"/>
                <Database className="absolute inset-0 m-auto w-6 h-6 text-blue-300 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold uppercase mb-2 tracking-tight">{loadingStatus}</h3>
            <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <p className="mt-6 text-slate-400 text-xs italic px-8 leading-relaxed">ШІ вивчає кожну пору шкіри та шукає найкращі засоби у базі Supabase...</p>
          </div>
        )}

        {step === 'results' && analysis && (
          <div className="space-y-8 pb-12 animate-in fade-in duration-1000">
            <div className="px-6 -mt-4">
               <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-7 shadow-2xl border border-slate-50 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-4">
                     <CheckCircle2 className="text-green-500 w-5 h-5"/>
                     <h3 className="font-bold text-lg uppercase italic text-slate-800 dark:text-white">Аналіз завершено</h3>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm mb-6 leading-relaxed font-medium">{analysis.skin_condition}</p>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-3xl border-l-4 border-blue-600 shadow-sm">
                     <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                     <p className="text-blue-900 dark:text-blue-200 text-sm italic font-bold leading-relaxed">"{analysis.advice}"</p>
                  </div>
               </div>
            </div>

            <div className="px-6 space-y-6">
              <h3 className="text-xl font-black uppercase tracking-tight px-2 flex items-center gap-2 text-slate-800 dark:text-white">
                 <ShoppingBag className="w-5 h-5 text-blue-600" /> Ваша програма догляду
              </h3>
              <div className="space-y-4">
                {recommendations.length > 0 ? recommendations.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-[2.5rem] shadow-sm hover:shadow-lg transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                       {item.image ? (
                           <img src={item.image} className="w-16 h-16 rounded-xl object-cover border border-slate-100" alt={item.name} />
                       ) : (
                           <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100"><ShoppingBag className="w-6 h-6 text-slate-200"/></div>
                       )}
                       <div className="flex-1 min-w-0">
                          <h4 className="font-black text-slate-800 dark:text-white leading-tight group-hover:text-blue-600 transition-colors text-sm line-clamp-2 uppercase tracking-tighter">{item.name}</h4>
                          <span className="text-[10px] font-bold text-slate-400">АРТ: {item.id}</span>
                       </div>
                    </div>
                    <p className="text-slate-500 text-xs mb-4 line-clamp-2 font-medium">{item.description}</p>
                    <div className="flex justify-between items-center border-t border-slate-50 dark:border-slate-800 pt-4">
                       <span className="font-black text-blue-600 dark:text-blue-400 text-xl">{item.price} грн</span>
                       <a href={item.link} target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase px-6 py-3 rounded-2xl shadow-lg shadow-blue-100 active:scale-95 transition-all">Придбати</a>
                    </div>
                  </div>
                )) : (
                    <div className="text-center py-8 text-slate-400 italic text-sm">На жаль, точних співпадінь не знайдено.</div>
                )}
              </div>
              <button onClick={() => setStep('welcome')} className="w-full mt-8 py-5 text-slate-300 font-black uppercase tracking-widest text-[10px] hover:text-blue-600 transition-colors italic">Новий аналіз</button>
            </div>
          </div>
        )}

        {step === 'history' && (
          <div className="p-6 space-y-4 pb-12 animate-in slide-in-from-left-4">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-800 dark:text-white">Ваша Історія</h2>
            {pastAnalyses.length === 0 ? (
              <div className="text-center py-24 text-slate-300 font-bold italic text-xs uppercase tracking-widest">Тут поки порожньо</div>
            ) : (
              pastAnalyses.map(item => (
                <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 active:scale-[0.98] cursor-pointer hover:border-blue-100 transition-all" onClick={() => { 
                      setAnalysis(item.analysis); 
                      setImage(item.userPhoto); 
                      setRecommendations(item.recommendations || []); 
                      setStep('results'); 
                    }}>
                  <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm">
                    <img src={item.userPhoto} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[10px] text-slate-400 font-black uppercase">{new Date(item.date).toLocaleDateString()}</p>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate uppercase tracking-tighter">{item.analysis?.skin_type || 'Тип шкіри'}</h4>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </div>
              ))
            )}
          </div>
        )}

        {step === 'profile' && (
          <div className="p-6 space-y-8 animate-in slide-in-from-right-4">
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 dark:text-white">Мій Профіль</h2>
            <div className="space-y-6 text-left">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 ml-1">Ваш Вік</label>
                <input type="number" value={userData.age} className="w-full p-5 rounded-3xl border border-slate-100 dark:border-slate-800 dark:bg-slate-950 focus:border-blue-500 outline-none font-bold text-lg shadow-inner" onChange={(e) => setUserData({...userData, age: e.target.value})} />
              </div>
              <button onClick={() => saveProfile(true)} disabled={isProfileSaving} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all uppercase tracking-widest">
                {isProfileSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Зберегти налаштування
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 h-20 px-8 flex items-center justify-between z-50">
        <button onClick={() => setStep('welcome')} className={`flex flex-col items-center gap-1 transition-all ${['welcome', 'upload', 'questions', 'analyzing', 'results'].includes(step) ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <Home className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-tighter">Дім</span>
        </button>
        <button onClick={() => setStep('history')} className={`flex flex-col items-center gap-1 transition-all ${step === 'history' ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <History className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-tighter">Історія</span>
        </button>
        <button onClick={() => setStep('profile')} className={`flex flex-col items-center gap-1 transition-all ${step === 'profile' ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <User className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-tighter">Профіль</span>
        </button>
      </nav>
    </div>
  );
}
