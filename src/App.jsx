import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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
const appId = 'hillary-skin-care-app';

// --- НАЛАШТУВАННЯ API GEMINI ---
const GEMINI_API_KEY = "AIzaSyC6zqfwIA1yEpA50rq4-ownpB0bwImusY8";

const XML_URL = "[https://hillary.ua/content/export/019d094ee103debf52c00b6828d5c1b3.xml](https://hillary.ua/content/export/019d094ee103debf52c00b6828d5c1b3.xml)";
const PROXY_URL = "[https://corsproxy.io/](https://corsproxy.io/)?"; 

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
  const [error, setError] = useState(null);
  const [hillaryProducts, setHillaryProducts] = useState([]);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileData, setProfileData] = useState({ age: '', skinType: '' });

  // 1. Авторизація та Telegram SDK
  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#ffffff');
    }
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, u => setUser(u));
    return () => unsubscribe();
  }, []);

  // 2. Завантаження Профілю та Історії
  useEffect(() => {
    if (!user) return;
    
    const fetchProfile = async () => {
      try {
        const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setProfileData({ age: data.age, skinType: data.skinType });
          setUserData(prev => ({ ...prev, age: data.age, skinType: data.skinType || 'не знаю' }));
        }
      } catch (e) { console.error("Profile error", e); }
    };
    fetchProfile();

    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPastAnalyses(docs.sort((a, b) => new Date(b.date) - new Date(a.date)));
    });
  }, [user]);

  // 3. Завантаження бази товарів (XML)
  useEffect(() => {
    const fetchBase = async () => {
      try {
        const res = await fetch(PROXY_URL + encodeURIComponent(XML_URL));
        const text = await res.text();
        const xml = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(xml.getElementsByTagName("offer")).map(o => ({
          id: o.querySelector('param[name="Артикул"]')?.textContent || o.getAttribute('id'),
          name: o.getElementsByTagName("name")[0]?.textContent,
          description: (o.getElementsByTagName("description")[0]?.textContent || "").replace(/<\/?[^>]+(>|$)/g, "").trim().substring(0, 200),
          link: o.getElementsByTagName("url")[0]?.textContent,
          price: o.getElementsByTagName("price")[0]?.textContent
        }));
        setHillaryProducts(items);
      } catch (e) { console.error("Catalog error", e); }
    };
    fetchBase();
  }, []);

  const saveProfile = async (manual = false) => {
    if (!user) return;
    if (manual) setIsProfileSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        age: userData.age,
        skinType: userData.skinType,
        updatedAt: new Date().toISOString()
      });
      setProfileData({ age: userData.age, skinType: userData.skinType });
    } catch (e) { console.error("Save profile error", e); }
    if (manual) setIsProfileSaving(false);
  };

  const handleCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64Image(reader.result.split(',')[1]);
        // Автозаповнення даних з профілю перед переходом до анкети
        setUserData(prev => ({ ...prev, age: profileData.age, skinType: profileData.skinType || 'не знаю' }));
        setStep('questions');
      };
      reader.readAsDataURL(file);
    }
  };

  const processAnalysis = async () => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("ВАШ_")) {
      setError("Помилка: Ключ API не налаштований.");
      return;
    }

    setLoading(true);
    setStep('analyzing');
    setError(null);
    await saveProfile(); 

    const context = hillaryProducts.slice(0, 40).map(p => `ID:${p.id} | ${p.name} | ${p.description}`).join('\n');
    const prompt = `Ти - косметолог Hillary. Проаналізуй фото. Підбери 3-4 ID зі списку. Каталог: ${context}`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `Вік: ${userData.age}, Тип: ${userData.skinType}, Скарги: ${userData.concerns}.` }, { inlineData: { mimeType: "image/png", data: base64Image } }] }],
          systemInstruction: { parts: [{ text: prompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      const result = JSON.parse(data.candidates[0].content.parts[0].text);

      if (!result.is_human_face) {
        setError(result.rejection_reason || "Ми не впізнали обличчя на фото.");
        setStep('upload');
        return;
      }

      setAnalysis(result);
      setRecommendations(hillaryProducts.filter(p => result.suggested_ids.includes(p.id)));

      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
          date: new Date().toISOString(),
          analysis: result,
          recommendationIds: result.suggested_ids,
          userPhoto: image
        });
      }
      setStep('results');
    } catch (e) {
      setError("Помилка аналізу. Спробуйте ще раз.");
      setStep('questions');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto shadow-2xl flex flex-col relative font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-md z-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep('welcome')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center -rotate-2 shadow-sm">
            <span className="text-white font-black text-sm">H</span>
          </div>
          <span className="font-bold text-lg tracking-tight uppercase">HiLLARY AI</span>
        </div>
        {image && (step === 'questions' || step === 'results') && (
            <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-blue-50 shadow-sm transition-all">
                <img src={image} className="w-full h-full object-cover" />
            </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {step === 'welcome' && (
          <div className="p-8 text-center mt-20 animate-in">
            <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Sparkles className="w-12 h-12 text-blue-500" />
            </div>
            <h1 className="text-3xl font-black mb-4 tracking-tight uppercase leading-tight">Експертний<br/>підбір</h1>
            <p className="text-slate-500 mb-12 leading-relaxed text-sm font-medium px-4">Зроби фото та отримай персональну програму догляду від HiLLARY Cosmetics.</p>
            <button onClick={() => setStep('upload')} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-lg shadow-xl shadow-blue-50 active:scale-95 transition-all uppercase tracking-wider">Почати підбір</button>
          </div>
        )}

        {step === 'upload' && (
          <div className="p-6 animate-in">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">Крок 1: Фото</h2>
            <p className="text-slate-500 mb-8 text-sm font-medium">Система проаналізує стан шкіри по вашому селфі.</p>
            <div className="border-2 border-dashed border-slate-200 rounded-[3rem] p-16 flex flex-col items-center bg-slate-50/50 relative hover:bg-slate-100 transition-colors cursor-pointer">
              <input type="file" accept="image/*" onChange={handleCapture} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <Camera className="text-blue-500 w-8 h-8" />
              </div>
              <span className="font-bold text-slate-700">Натисни для фото</span>
            </div>
            {error && <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold">{error}</div>}
          </div>
        )}

        {step === 'questions' && (
          <div className="p-6 space-y-8 animate-in">
            <button onClick={() => setStep('upload')} className="mb-2 flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><ArrowLeft className="w-4 h-4"/> Назад до фото</button>
            <h2 className="text-2xl font-black uppercase tracking-tight">Крок 2: Деталі</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Вік</label>
                <input type="number" value={userData.age} className="w-full p-4 rounded-2xl border border-slate-100 focus:border-blue-500 outline-none font-bold text-lg" onChange={(e) => setUserData({...userData, age: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-50 text-slate-400'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Що тебе турбує?</label>
                <textarea value={userData.concerns} placeholder="Опиши свої скарги..." className="w-full p-4 rounded-2xl border border-slate-100 focus:border-blue-500 h-28 resize-none text-sm font-medium outline-none" onChange={(e) => setUserData({...userData, concerns: e.target.value})} />
              </div>
              <button onClick={processAnalysis} disabled={!userData.age || loading} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 transition-all uppercase tracking-widest">Аналізувати</button>
            </div>
            {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold">{error}</div>}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center animate-pulse">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-6"/>
            <h3 className="text-xl font-bold uppercase tracking-tight">Обробляємо дані...</h3>
            <p className="text-slate-400 text-sm mt-2 font-medium italic">ШІ підбирає найкраще з асортименту Hillary</p>
          </div>
        )}

        {step === 'results' && analysis && (
          <div className="pb-12 animate-in">
             <div className="h-56 relative shadow-md">
              <img src={image} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent"></div>
              <button onClick={() => setStep('upload')} className="absolute top-4 right-4 bg-white/80 p-3 rounded-full shadow-lg"><RefreshCcw className="w-5 h-5 text-slate-700" /></button>
            </div>
            
            <div className="px-6 -mt-10 relative z-10">
              <div className="bg-white rounded-[2.5rem] p-6 shadow-2xl border border-slate-50 mb-8">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 uppercase tracking-tight italic"><CheckCircle2 className="text-green-500 w-5 h-5"/> Висновок</h3>
                <p className="text-slate-700 text-sm mb-6 leading-relaxed font-medium">{analysis.skin_condition}</p>
                <div className="bg-blue-50 p-5 rounded-3xl flex items-start gap-3 border-l-4 border-blue-600 shadow-sm">
                  <Lightbulb className="w-5 h-5 text-blue-600 mt-1 shrink-0" />
                  <p className="text-blue-900 text-sm italic font-bold leading-relaxed">"{analysis.advice}"</p>
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-6 px-2 uppercase tracking-tight">Твій догляд:</h3>
              <div className="space-y-4">
                {recommendations.map(p => (
                  <div key={p.id} className="bg-white border border-slate-100 p-5 rounded-[2.5rem] shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">АРТ: {p.id}</span>
                      <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 p-2 bg-blue-50 rounded-xl hover:bg-blue-600 transition-all"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                    <h4 className="font-black text-slate-800 text-md leading-tight mb-2">{p.name}</h4>
                    <p className="text-slate-500 text-xs leading-relaxed mb-4 font-medium">{p.description}</p>
                    <div className="flex justify-between items-center">
                        <span className="text-xl font-black text-blue-600">{p.price} грн</span>
                        <a href={p.link} target="_blank" className="bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-2xl active:bg-blue-600 active:text-white transition-all">Купити</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'history' && (
          <div className="p-6 animate-in">
            <h2 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-800">Історія</h2>
            {pastAnalyses.length === 0 ? <p className="text-center py-24 text-slate-300 font-bold uppercase text-xs tracking-widest">Історія порожня</p> : pastAnalyses.map(item => (
              <div key={item.id} className="p-4 rounded-[2rem] mb-4 flex items-center gap-4 bg-slate-50 shadow-sm border border-slate-100 transition-transform active:scale-95">
                <img src={item.userPhoto} className="w-16 h-16 rounded-2xl object-cover shadow-sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-slate-400 font-bold">{new Date(item.date).toLocaleDateString()}</p>
                  <h4 className="font-black text-xs truncate uppercase tracking-tighter text-slate-800">{item.analysis.skin_type || 'Тип'} шкіри</h4>
                </div>
                <button onClick={() => { setAnalysis(item.analysis); setImage(item.userPhoto); setRecommendations(hillaryProducts.filter(p => item.recommendationIds.includes(p.id))); setStep('results'); }} className="text-blue-600 text-[9px] font-black uppercase px-4 py-2 bg-white rounded-xl shadow-sm">Перегляд</button>
              </div>
            ))}
          </div>
        )}

        {step === 'profile' && (
          <div className="p-6 space-y-8 animate-in">
            <h2 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-800">Мій Профіль</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Вік</label>
                <input type="number" value={userData.age} className="w-full p-5 rounded-2xl border border-slate-100 focus:border-blue-500 outline-none font-bold text-lg" onChange={(e) => setUserData({...userData, age: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Тип шкіри</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                    <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-4 rounded-2xl border-2 font-bold text-xs transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-50 text-slate-400'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => saveProfile(true)} disabled={isProfileSaving} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-bold shadow-lg flex items-center justify-center gap-3 transition-transform active:scale-95 uppercase tracking-widest">
                {isProfileSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {isProfileSaving ? "Зберігаємо..." : "Зберегти"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-100 h-20 px-8 flex items-center justify-between z-50">
        <button onClick={() => setStep('welcome')} className={`flex flex-col items-center gap-1 transition-all ${['welcome', 'upload', 'questions', 'analyzing', 'results'].includes(step) ? 'text-blue-600' : 'text-slate-300'}`}>
          <Home className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Дім</span>
        </button>
        <button onClick={() => setStep('history')} className={`flex flex-col items-center gap-1 transition-all ${step === 'history' ? 'text-blue-600' : 'text-slate-300'}`}>
          <History className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Історія</span>
        </button>
        <button onClick={() => setStep('profile')} className={`flex flex-col items-center gap-1 transition-all ${step === 'profile' ? 'text-blue-600' : 'text-slate-300'}`}>
          <User className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Профіль</span>
        </button>
      </nav>
    </div>
  );
}
