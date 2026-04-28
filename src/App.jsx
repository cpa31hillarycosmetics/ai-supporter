import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { Camera, RefreshCcw, Sparkles, ShoppingBag, CheckCircle2, AlertCircle, ChevronRight, ExternalLink, Lightbulb, History, ArrowLeft, Loader2, Home, User, Save } from 'lucide-react';

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

// --- ДЖЕРЕЛО ДАНИХ ТОВАРІВ (Локальний JSON) ---
const PRODUCT_DATA_URL = "./hillary_products_converted.json";

const FALLBACK_PRODUCTS = [
  { id: "101", name: "Очищувальна пінка для вмивання", description: "М'яко очищує шкіру, не пересушуючи її. Підходить для всіх типів.", link: "https://hillary.ua", price: "249" },
  { id: "102", name: "Гіалуронова сироватка Smart", description: "Інтенсивно зволожує та розгладжує дрібні зморшки.", link: "https://hillary.ua", price: "389" },
  { id: "103", name: "Крем з вітаміном С", description: "Вирівнює тон шкіри та надає природного сяйва.", link: "https://hillary.ua", price: "450" }
];

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
  const [hillaryProducts, setHillaryProducts] = useState([]);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  
  // Ключ має бути порожнім рядком для автоматичної підстановки середовищем
  const apiKey = ""; 

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.colorScheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {}
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const fetchProfile = async () => {
      try {
        const profileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'));
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setUserData(prev => ({ ...prev, age: data.age || '', skinType: data.skinType || 'не знаю' }));
        }
      } catch (err) {}
    };
    fetchProfile();

    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    const unsubscribe = onSnapshot(historyRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPastAnalyses(items.sort((a, b) => new Date(b.date) - new Date(a.date)));
    }, (err) => {});
    
    return () => unsubscribe();
  }, [user]);

  const fetchProducts = async () => {
    try {
      const response = await fetch(PRODUCT_DATA_URL);
      if (!response.ok) throw new Error("File not found");
      
      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.products || data.offers || []);
      setHillaryProducts(items);
      return items;
    } catch (err) {
      setHillaryProducts(FALLBACK_PRODUCTS);
      return FALLBACK_PRODUCTS;
    }
  };

  const saveProfile = async (manual = false) => {
    if (!user) return;
    if (manual) setIsProfileSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        age: userData.age,
        skinType: userData.skinType,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
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
    e.target.value = "";
  };

  const runAIAnalysis = async () => {
    if (!base64Image) {
      setError("Будь ласка, завантажте фото");
      setStep('upload');
      return;
    }

    setLoading(true);
    setLoadingProgress(10);
    setLoadingStatus('Ініціалізація...');
    setStep('analyzing');
    setError(null);
    
    saveProfile().catch(() => {});

    try {
      setLoadingStatus('Завантаження каталогу...');
      setLoadingProgress(30);
      let products = hillaryProducts;
      if (products.length === 0) {
        products = await fetchProducts();
      }
      
      setLoadingProgress(50);
      setLoadingStatus('AI аналізує вашу шкіру...');

      const productContext = products.slice(0, 50).map(p => 
        `ID: ${p.id} | ${p.name} | ${p.description}`
      ).join('\n---\n');

      const systemPrompt = `Ти - професійний косметолог Hillary. Проаналізуй фото та анкету. 
      Підбери 3-4 ID зі списку товарів. 
      Відповідь ПОВИННА бути ТІЛЬКИ у форматі JSON:
      {
        "is_human_face": true,
        "skin_condition": "детальний опис стану",
        "advice": "головна порада",
        "suggested_ids": ["id1", "id2"],
        "skin_type": "тип шкіри"
      }
      ТОВАРИ ДЛЯ ВИБОРУ: ${productContext}`;

      const userQuery = `Користувач: вік ${userData.age}, тип шкіри ${userData.skinType}, скарги: ${userData.concerns || 'відсутні'}.`;

      // Реалізація експоненціальної затримки (Exponential Backoff)
      const callAIWithRetry = async (retries = 0) => {
        const delays = [1000, 2000, 4000, 8000, 16000];
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: userQuery },
                  { inlineData: { mimeType: imageMimeType, data: base64Image } }
                ]
              }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { responseMimeType: "application/json" }
            })
          });

          if (!response.ok) {
            if (retries < 5) {
              await new Promise(r => setTimeout(r, delays[retries]));
              return callAIWithRetry(retries + 1);
            }
            throw new Error(`API Error: ${response.status}`);
          }
          return await response.json();
        } catch (err) {
          if (retries < 5) {
            await new Promise(r => setTimeout(r, delays[retries]));
            return callAIWithRetry(retries + 1);
          }
          throw err;
        }
      };

      const result = await callAIWithRetry();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!aiText) throw new Error("No response from AI");

      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const parsedResult = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
      
      if (!parsedResult.is_human_face) {
        setError("Ми не впізнали обличчя. Спробуйте інше фото при кращому освітленні.");
        setStep('upload');
        setLoading(false);
        return;
      }

      setLoadingProgress(90);
      setLoadingStatus('Підбір засобів...');

      setAnalysis(parsedResult);
      const matchedItems = products.filter(p => parsedResult.suggested_ids.includes(p.id));
      setRecommendations(matchedItems.length > 0 ? matchedItems : products.slice(0, 3));
      
      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
          date: new Date().toISOString(),
          analysis: parsedResult,
          recommendationIds: parsedResult.suggested_ids,
          userPhoto: image
        });
      }
      
      setLoadingProgress(100);
      setTimeout(() => setStep('results'), 300);

    } catch (err) {
      setError(`Збій аналізу. Спробуйте ще раз пізніше.`);
      setStep('questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 max-w-md mx-auto shadow-2xl flex flex-col overflow-hidden relative pb-20 transition-colors duration-300">
      <header className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-50 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep('welcome')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center -rotate-2 shadow-md">
            <span className="text-white font-black text-sm">H</span>
          </div>
          <span className="font-bold text-lg tracking-tight uppercase text-blue-600 dark:text-blue-400">HiLLARY AI</span>
        </div>
        <button onClick={() => setStep('history')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-90">
          <History className="w-5 h-5 text-slate-400" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {step === 'welcome' && (
          <div className="flex flex-col items-center justify-center min-h-[75vh] p-8 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner">
              <Sparkles className="w-12 h-12 text-blue-500" />
            </div>
            <h1 className="text-3xl font-black mb-4 tracking-tight leading-tight uppercase text-slate-800 dark:text-white">Hillary AI<br/>Expert</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-12 leading-relaxed text-sm font-medium px-4">Отримайте професійну програму догляду на основі аналізу вашої шкіри за допомогою ШІ.</p>
            <button onClick={() => setStep('upload')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[2rem] font-bold text-lg shadow-xl shadow-blue-100 dark:shadow-none active:scale-95 transition-all uppercase tracking-wider">Почати</button>
          </div>
        )}

        {step === 'upload' && (
          <div className="p-6 animate-in slide-in-from-right-4">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">Крок 1: Фото</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm font-medium">Зробіть селфі при денному світлі для кращого результату.</p>
            
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] p-16 flex flex-col items-center bg-white dark:bg-slate-900/30 relative hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer group">
              <input 
                type="file" 
                accept="image/*" 
                capture="user"
                onChange={onPhotoSelected} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full" 
              />
              <div className="w-16 h-16 bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-sm border dark:border-slate-700 group-active:scale-90 transition-transform">
                <Camera className="text-blue-500 w-8 h-8" />
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-widest text-center">Натисніть,<br/>щоб додати фото</span>
            </div>
            
            {error && <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold flex gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
          </div>
        )}

        {step === 'questions' && (
          <div className="p-6 animate-in slide-in-from-right-4">
             <button onClick={() => setStep('upload')} className="mb-4 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> До фото</button>
            <h2 className="text-2xl font-black mb-6 uppercase tracking-tight">Крок 2: Деталі</h2>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Ваш вік</label>
                <input type="number" value={userData.age} placeholder="25" className="w-full p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none font-bold text-lg text-slate-900 dark:text-white transition-all" onChange={(e) => setUserData({...userData, age: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Ваш тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-sm' : 'border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Що вас турбує?</label>
                <textarea value={userData.concerns} placeholder="Наприклад: сухість, висипи, тьмяний колір..." className="w-full p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none h-28 resize-none text-sm font-medium leading-relaxed text-slate-900 dark:text-white transition-all" onChange={(e) => setUserData({...userData, concerns: e.target.value})} />
              </div>
              <button onClick={runAIAnalysis} disabled={!userData.age || loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50">Аналізувати</button>
            </div>
            {error && <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold flex gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center animate-in fade-in">
            <div className="relative mb-12">
               <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center animate-pulse shadow-inner">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin"/>
               </div>
               <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-bounce" />
            </div>
            <h3 className="text-xl font-bold uppercase tracking-tight dark:text-white mb-2">{loadingStatus}</h3>
            <div className="w-full max-w-[240px] h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-6 shadow-inner">
              <div className="h-full bg-blue-600 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-6 font-medium italic px-4 leading-relaxed">Зачекайте кілька секунд. ШІ Hillary підбирає найкращу програму для вас.</p>
          </div>
        )}

        {step === 'results' && analysis && (
          <div className="pb-12 animate-in fade-in duration-1000">
            <div className="h-64 relative shadow-inner">
              <img src={image} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-transparent"></div>
              <button onClick={() => setStep('upload')} className="absolute top-4 right-4 bg-white/80 dark:bg-slate-900/80 p-3 rounded-2xl shadow-lg backdrop-blur-sm active:scale-90 transition-transform"><RefreshCcw className="w-5 h-5 text-slate-700 dark:text-slate-300" /></button>
            </div>
            <div className="px-6 -mt-12 relative z-10">
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-7 shadow-2xl border border-slate-50 dark:border-slate-800 mb-8 transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-2 mb-4">
                   <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <CheckCircle2 className="text-green-500 w-5 h-5"/>
                   </div>
                   <h3 className="font-bold text-lg uppercase tracking-tight italic text-slate-800 dark:text-white">Ваш аналіз</h3>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm mb-6 leading-relaxed font-medium">{analysis.skin_condition}</p>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-3xl flex items-start gap-3 border-l-4 border-blue-600 shadow-sm">
                  <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                  <p className="text-blue-900 dark:text-blue-200 text-sm italic font-bold leading-relaxed">"{analysis.advice}"</p>
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 px-2 uppercase tracking-tight">Рекомендований догляд:</h3>
              <div className="space-y-4">
                {recommendations.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-[2.5rem] shadow-sm hover:shadow-lg transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Арт: {item.id}</span>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                    <h4 className="font-black text-slate-800 dark:text-white text-md leading-tight mb-2 group-hover:text-blue-600 transition-colors">{item.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mb-4 font-medium line-clamp-3">{item.description}</p>
                    <div className="flex justify-between items-center border-t border-slate-50 dark:border-slate-800 pt-4">
                       <span className="font-black text-blue-600 dark:text-blue-400 text-xl">{item.price} грн</span>
                       <a href={item.link} target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-7 py-4 rounded-2xl transition-all shadow-lg active:scale-95">Купити</a>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep('welcome')} className="w-full mt-12 py-5 text-slate-300 dark:text-slate-700 font-black uppercase tracking-[0.3em] text-[10px] hover:text-blue-600 transition-colors">Новий аналіз</button>
            </div>
          </div>
        )}

        {step === 'history' && (
          <div className="p-6 animate-in slide-in-from-left-4">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-blue-600 transition-colors"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-8 text-slate-800 dark:text-white uppercase tracking-tight">Ваша історія</h2>
            <div className="space-y-4 pb-12">
              {pastAnalyses.length === 0 ? (
                <div className="text-center py-24 text-slate-300 dark:text-slate-800 font-bold italic text-xs uppercase tracking-widest leading-loose">Історія порожня</div>
              ) : (
                pastAnalyses.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 transition-all hover:border-blue-200 dark:hover:border-blue-900 active:scale-[0.98] cursor-pointer" onClick={() => { 
                        setAnalysis(item.analysis); 
                        setImage(item.userPhoto); 
                        const matched = hillaryProducts.filter(p => item.recommendationIds.includes(p.id));
                        setRecommendations(matched.length > 0 ? matched : hillaryProducts.slice(0, 3)); 
                        setStep('results'); 
                      }}>
                    <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-sm border-2 border-white dark:border-slate-800">
                      <img src={item.userPhoto} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase">{new Date(item.date).toLocaleDateString()}</p>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate uppercase tracking-tighter">{item.analysis?.skin_type || 'Аналіз'}</h4>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-700" />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {step === 'profile' && (
          <div className="p-6 space-y-8 animate-in slide-in-from-right-4">
            <h2 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-800 dark:text-white">Мій Профіль</h2>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Ваш вік</label>
                <input type="number" value={userData.age} placeholder="25" className="w-full p-5 rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none font-bold text-lg text-slate-900 dark:text-white shadow-inner transition-all" onChange={(e) => setUserData({...userData, age: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Ваш тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-sm' : 'border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => saveProfile(true)} disabled={isProfileSaving} className="w-full bg-slate-900 dark:bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all uppercase tracking-widest">
                {isProfileSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {isProfileSaving ? "Зберігаємо..." : "Зберегти налаштування"}
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 h-20 px-8 flex items-center justify-between z-50">
        <button onClick={() => setStep('welcome')} className={`flex flex-col items-center gap-1 transition-all ${['welcome', 'upload', 'questions', 'analyzing', 'results'].includes(step) ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <Home className="w-6 h-6" /><span className="text-[9px] font-black uppercase tracking-tighter">Дім</span>
        </button>
        <button onClick={() => setStep('history')} className={`flex flex-col items-center gap-1 transition-all ${step === 'history' ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <History className="w-6 h-6" /><span className="text-[9px] font-black uppercase tracking-tighter">Історія</span>
        </button>
        <button onClick={() => setStep('profile')} className={`flex flex-col items-center gap-1 transition-all ${step === 'profile' ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <User className="w-6 h-6" /><span className="text-[9px] font-black uppercase tracking-tighter">Профіль</span>
        </button>
      </nav>
    </div>
  );
}
