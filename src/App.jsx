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

// --- ДЖЕРЕЛО ДАНИХ ТОВАРІВ ---
const XML_URL = "https://hillary.ua/content/export/019d094ee103debf52c00b6828d5c1b3.xml";
const PROXY_URL = "https://corsproxy.io/?"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('welcome');
  const [image, setImage] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [userData, setUserData] = useState({ age: '', skinType: 'не знаю', concerns: '' });
  const [analysis, setAnalysis] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [pastAnalyses, setPastAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hillaryProducts, setHillaryProducts] = useState([]);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  
  // Ваш персональний ключ Gemini
  const apiKey = "AIzaSyC6zqfwIA1yEpA50rq4-ownpB0bwImusY8"; 

  // 1. Ініціалізація Telegram та Авторизація
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
      } catch (e) {
        console.error("Auth error:", e);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Завантаження бази товарів та профілю
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsLoading(true);
        const response = await fetch(PROXY_URL + encodeURIComponent(XML_URL));
        if (!response.ok) throw new Error("Помилка завантаження XML через проксі");
        
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const offers = xmlDoc.getElementsByTagName("offer");
        
        if (offers.length === 0) throw new Error("XML порожній або має невірний формат");

        const parsedData = Array.from(offers).map(offer => {
          // Шукаємо артикул у параметрах або ID
          const sku = offer.querySelector('param[name="Артикул"]')?.textContent || 
                      offer.getAttribute('id') || 
                      offer.querySelector('vendorCode')?.textContent;
                      
          return {
            id: sku,
            name: offer.getElementsByTagName("name")[0]?.textContent || "Товар без назви",
            description: (offer.getElementsByTagName("description")[0]?.textContent || "").replace(/<\/?[^>]+(>|$)/g, "").trim().substring(0, 300),
            link: offer.getElementsByTagName("url")[0]?.textContent || "https://hillary.ua",
            price: offer.getElementsByTagName("price")[0]?.textContent || "0",
          };
        }).filter(p => p.id); // Прибираємо товари без ID

        setHillaryProducts(parsedData);
        setError(null);
      } catch (err) {
        console.error("Catalog loading error:", err);
        setError("Виникла проблема з завантаженням товарів. Спробуйте оновити сторінку.");
      } finally {
        setProductsLoading(false);
      }
    };
    fetchProducts();
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
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    };
    fetchProfile();

    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    const unsubscribe = onSnapshot(historyRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPastAnalyses(items.sort((a, b) => new Date(b.date) - new Date(a.date)));
    }, (err) => {
      console.error("History listener error:", err);
    });
    
    return () => unsubscribe();
  }, [user]);

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
      console.error("Save profile error:", e);
    } finally {
      if (manual) setIsProfileSaving(false);
    }
  };

  const onPhotoSelected = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(URL.createObjectURL(file));
        setBase64Image(reader.result.split(',')[1]);
        setError(null);
        setStep('questions');
      };
      reader.readAsDataURL(file);
    }
  };

  const runAIAnalysis = async () => {
    // Фінальні перевірки перед запуском
    if (hillaryProducts.length === 0) {
      setError("Каталог Hillary ще не завантажився. Будь ласка, зачекайте 2-3 секунди.");
      return;
    }
    if (!base64Image) {
      setError("Ми втратили ваше фото. Будь ласка, завантажте його знову.");
      setStep('upload');
      return;
    }
    if (!userData.age) {
      setError("Будь ласка, вкажіть ваш вік.");
      return;
    }

    setLoading(true);
    setStep('analyzing');
    setError(null);
    
    // Зберігаємо профіль у фоні
    saveProfile().catch(console.error);

    // Беремо частину товарів для промпту (ліміт Gemini)
    const productContext = hillaryProducts.slice(0, 45).map(p => 
      `АРТ: ${p.id} | ${p.name} | ${p.description}`
    ).join('\n---\n');

    const systemPrompt = `Ти - професійний ШІ-косметолог бренду HiLLARY Cosmetics.
    Твоє завдання:
    1. Перевір, чи на фото обличчя. Якщо ні - поверни is_human_face: false.
    2. Проаналізуй стан шкіри (пори, зморшки, висипи, тон).
    3. Підбери 3 найактуальніші АРТИКУЛИ (ID) товарів HiLLARY з наданого списку.
    
    Обов'язково поверни ТІЛЬКИ чистий JSON-об'єкт:
    {
      "is_human_face": true,
      "skin_condition": "детальний опис стану шкіри",
      "advice": "головна порада щодо догляду",
      "suggested_ids": ["артикул1", "артикул2", "артикул3"],
      "skin_type": "тип шкіри користувача"
    }
    
    СПИСОК ТОВАРІВ:
    ${productContext}`;

    const performRequest = async (retryCount = 0) => {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: `Користувач: вік ${userData.age}, тип ${userData.skinType}, скарги: ${userData.concerns || 'немає'}. Проаналізуй фото та підбери догляд.` },
                { inlineData: { mimeType: "image/png", data: base64Image } }
              ]
            }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (!response.ok) {
          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1500;
            await new Promise(r => setTimeout(r, delay));
            return performRequest(retryCount + 1);
          }
          throw new Error("API Gemini недоступне");
        }

        const data = await response.json();
        let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!aiText) throw new Error("ШІ не надав відповіді");
        
        // Видалення Markdown форматування, якщо воно є
        const cleanJson = aiText.replace(/```json|```/g, "").trim();
        const parsedResult = JSON.parse(cleanJson);
        
        if (!parsedResult.is_human_face) {
          setError(parsedResult.rejection_reason || "На фото не знайдено обличчя. Спробуйте зробити селфі при кращому освітленні.");
          setStep('upload');
          setLoading(false);
          return;
        }

        setAnalysis(parsedResult);
        // Співставлення ID товарів з нашої бази
        const matchedItems = hillaryProducts.filter(p => parsedResult.suggested_ids.includes(p.id));
        setRecommendations(matchedItems.length > 0 ? matchedItems : hillaryProducts.slice(0, 3));
        
        if (user) {
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
            date: new Date().toISOString(),
            analysis: parsedResult,
            recommendationIds: parsedResult.suggested_ids,
            userPhoto: image
          });
        }
        setStep('results');
      } catch (err) {
        console.error("Analysis process error:", err);
        setError("Виникла помилка під час аналізу. Спробуйте ще раз через хвилину.");
        setStep('questions');
      } finally {
        setLoading(false);
      }
    };

    await performRequest();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 max-w-md mx-auto shadow-2xl flex flex-col overflow-hidden relative pb-20 transition-colors duration-300">
      {/* Шапка */}
      <header className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-50 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep('welcome')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center -rotate-2">
            <span className="text-white font-black text-sm">H</span>
          </div>
          <span className="font-bold text-lg tracking-tight uppercase text-blue-600 dark:text-blue-400">HiLLARY AI</span>
        </div>
        <div className="flex items-center gap-3">
          {productsLoading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          <button onClick={() => setStep('history')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <History className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {step === 'welcome' && (
          <div className="flex flex-col items-center justify-center min-h-[75vh] p-8 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner">
              <Sparkles className="w-12 h-12 text-blue-500" />
            </div>
            <h1 className="text-3xl font-black mb-4 tracking-tight leading-tight uppercase text-slate-800 dark:text-white">Персональний догляд</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-12 leading-relaxed text-sm font-medium px-4">ШІ Hillary проаналізує вашу шкіру за фото та підбере індивідуальний догляд.</p>
            <button 
              disabled={productsLoading}
              onClick={() => setStep('upload')} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[2rem] font-bold text-lg shadow-xl shadow-blue-100 dark:shadow-none active:scale-95 transition-all uppercase tracking-wider disabled:opacity-50"
            >
              {productsLoading ? "Завантаження бази..." : "Почати аналіз"}
            </button>
          </div>
        )}

        {step === 'upload' && (
          <div className="p-6 animate-in slide-in-from-right-4">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">Крок 1: Фото</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm font-medium">Зробіть селфі при гарному денному світлі для максимально точного результату.</p>
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] p-16 flex flex-col items-center bg-white dark:bg-slate-900/30 relative hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer">
              <input type="file" accept="image/*" onChange={onPhotoSelected} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="w-16 h-16 bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-sm border dark:border-slate-700">
                <Camera className="text-blue-500 w-8 h-8" />
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-widest">Зробити селфі</span>
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
                <input 
                  type="number" 
                  value={userData.age}
                  placeholder="Наприклад: 25"
                  className="w-full p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none font-bold text-lg text-slate-900 dark:text-white"
                  onChange={(e) => setUserData({...userData, age: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Ваш тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Що вас турбує?</label>
                <textarea 
                  value={userData.concerns}
                  placeholder="Наприклад: висипи, сухість, зморшки..."
                  className="w-full p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none h-28 resize-none text-sm font-medium leading-relaxed text-slate-900 dark:text-white"
                  onChange={(e) => setUserData({...userData, concerns: e.target.value})}
                />
              </div>
              <button 
                onClick={runAIAnalysis} 
                disabled={!userData.age || loading} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
              >
                Аналізувати стан шкіри
              </button>
            </div>
            {error && <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold flex gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center">
            <div className="relative mb-8">
               <Loader2 className="w-16 h-16 text-blue-600 animate-spin"/>
               <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-blue-300 animate-pulse" />
               </div>
            </div>
            <h3 className="text-xl font-bold uppercase tracking-tight dark:text-white">Йде аналіз...</h3>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-3 font-medium italic px-4">ШІ Hillary порівнює стан вашої шкіри з найкращими формулами нашого бренду</p>
          </div>
        )}

        {step === 'results' && analysis && (
          <div className="pb-12 animate-in fade-in duration-1000">
            <div className="h-60 relative shadow-inner">
              <img src={image} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-transparent"></div>
              <button onClick={() => setStep('upload')} className="absolute top-4 right-4 bg-white/80 dark:bg-slate-900/80 p-3 rounded-2xl shadow-lg backdrop-blur-sm"><RefreshCcw className="w-5 h-5 text-slate-700 dark:text-slate-300" /></button>
            </div>
            
            <div className="px-6 -mt-12 relative z-10">
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 shadow-2xl border border-slate-50 dark:border-slate-800 mb-8">
                <div className="flex items-center gap-2 mb-4">
                   <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <CheckCircle2 className="text-green-500 w-5 h-5"/>
                   </div>
                   <h3 className="font-bold text-lg uppercase tracking-tight italic text-slate-800 dark:text-white">Результат</h3>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm mb-6 leading-relaxed font-medium">{analysis.skin_condition}</p>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-3xl flex items-start gap-3 border-l-4 border-blue-600 shadow-sm">
                  <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                  <p className="text-blue-900 dark:text-blue-200 text-sm italic font-bold leading-relaxed">"{analysis.advice}"</p>
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 px-2 uppercase tracking-tight">Ваша програма догляду:</h3>
              
              <div className="space-y-4">
                {recommendations.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Арт: {item.id}</span>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                    <h4 className="font-black text-slate-800 dark:text-white text-md leading-tight mb-2 group-hover:text-blue-600 transition-colors">{item.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mb-4 font-medium line-clamp-3">{item.description}</p>
                    <div className="flex justify-between items-center border-t border-slate-50 dark:border-slate-800 pt-4">
                       <span className="font-black text-blue-600 dark:text-blue-400 text-xl">{item.price} грн</span>
                       <a href={item.link} target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-7 py-4 rounded-2xl transition-all shadow-lg shadow-blue-50 dark:shadow-none">Купити</a>
                    </div>
                  </div>
                ))}
              </div>
              
              <button onClick={() => setStep('welcome')} className="w-full mt-12 py-5 text-slate-300 dark:text-slate-700 font-black uppercase tracking-[0.3em] text-[10px] hover:text-blue-600 transition-colors">Розпочати новий аналіз</button>
            </div>
          </div>
        )}

        {step === 'history' && (
          <div className="p-6 animate-in slide-in-from-left-4">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-8 text-slate-800 dark:text-white uppercase tracking-tight">Ваша історія</h2>
            <div className="space-y-4 pb-12">
              {pastAnalyses.length === 0 ? (
                <div className="text-center py-24 text-slate-300 dark:text-slate-800 font-bold italic text-xs leading-relaxed uppercase tracking-widest">
                  У вас поки немає збережених аналізів
                </div>
              ) : (
                pastAnalyses.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 transition-transform active:scale-95 cursor-pointer" onClick={() => { 
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
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate uppercase tracking-tighter">{item.analysis?.skin_type || 'Тип шкіри'}</h4>
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
                <input 
                  type="number" 
                  value={userData.age}
                  placeholder="25"
                  className="w-full p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none font-bold text-lg text-slate-900 dark:text-white shadow-inner"
                  onChange={(e) => setUserData({...userData, age: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1 block mb-2">Ваш тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => saveProfile(true)} disabled={isProfileSaving} className="w-full bg-slate-900 dark:bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-lg flex items-center justify-center gap-3 transition-transform active:scale-95 uppercase tracking-widest">
                {isProfileSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {isProfileSaving ? "Зберігаємо..." : "Зберегти налаштування"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Навігація */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 h-20 px-8 flex items-center justify-between z-50">
        <button onClick={() => setStep('welcome')} className={`flex flex-col items-center gap-1 transition-all ${['welcome', 'upload', 'questions', 'analyzing', 'results'].includes(step) ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <Home className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Дім</span>
        </button>
        <button onClick={() => setStep('history')} className={`flex flex-col items-center gap-1 transition-all ${step === 'history' ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <History className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Історія</span>
        </button>
        <button onClick={() => setStep('profile')} className={`flex flex-col items-center gap-1 transition-all ${step === 'profile' ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-300 dark:text-slate-700'}`}>
          <User className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Профіль</span>
        </button>
      </nav>
    </div>
  );
}
