import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Camera, RefreshCcw, Sparkles, ShoppingBag, CheckCircle2, AlertCircle, ChevronRight, ExternalLink, Lightbulb, History, ArrowLeft, Loader2 } from 'lucide-react';

// 1. ЗАМІНІТЬ ЦІ ДАНІ НА ВАШІ З FIREBASE CONSOLE
// Копіюйте об'єкт повністю з Firebase -> Project Settings -> Your Apps
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

// 2. ВСТАВТЕ ВАШ КЛЮЧ GEMINI (ОТРИМАЙТЕ НА [https://aistudio.google.com/](https://aistudio.google.com/))
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
  const [productsLoading, setProductsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hillaryProducts, setHillaryProducts] = useState([]);

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchXML = async () => {
      try {
        const response = await fetch(PROXY_URL + encodeURIComponent(XML_URL));
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const offers = xml.getElementsByTagName("offer");
        const parsed = Array.from(offers).map(offer => ({
          id: offer.querySelector('param[name="Артикул"]')?.textContent || offer.getAttribute('id'),
          name: offer.getElementsByTagName("name")[0]?.textContent,
          description: (offer.getElementsByTagName("description")[0]?.textContent || "").replace(/<\/?[^>]+(>|$)/g, "").trim().substring(0, 200),
          link: offer.getElementsByTagName("url")[0]?.textContent,
          price: offer.getElementsByTagName("price")[0]?.textContent
        }));
        setHillaryProducts(parsed);
        setProductsLoading(false);
      } catch (err) {
        setProductsLoading(false);
      }
    };
    fetchXML();
  }, []);

  useEffect(() => {
    if (!user) return;
    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    const unsubscribe = onSnapshot(historyRef, (snap) => {
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPastAnalyses(items.sort((a, b) => new Date(b.date) - new Date(a.date)));
    }, (err) => {
      console.error("Firestore error!", err);
    });
    return () => unsubscribe();
  }, [user]);

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(URL.createObjectURL(file));
        setBase64Image(reader.result.split(',')[1]);
        setStep('questions');
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async () => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("ТУТ_ВАШ_КЛЮЧ")) {
      setError("Помилка: Ви не вставили API Ключ Gemini у файл App.jsx (рядок 31)");
      return;
    }
    setLoading(true);
    setStep('analyzing');
    const catalog = hillaryProducts.slice(0, 40).map(p => `Арт: ${p.id}, Назва: ${p.name}, Дія: ${p.description}`).join('\n');
    const prompt = `Ти - косметолог HiLLARY. Проаналізуй фото. Підбери 3-4 ID зі списку. Не пиши ID в тексті. Спирайся на: ${catalog}`;
    
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

      // ПЕРЕВІРКА НАЯВНОСТІ РЕЗУЛЬТАТУ
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error(data.error?.message || "Gemini API не повернув результат. Перевірте ключ або баланс.");
      }

      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      if (!parsed.is_human_face) {
        setError(parsed.rejection_reason || "Це не обличчя");
        setStep('upload');
        setLoading(false);
        return;
      }
      setAnalysis(parsed);
      const recs = hillaryProducts.filter(p => parsed.suggested_ids.includes(p.id));
      setRecommendations(recs);
      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
          date: new Date().toISOString(),
          analysis: parsed,
          recommendationIds: recs.map(r => r.id),
          userPhoto: image
        });
      }
      setStep('results');
    } catch (e) {
      console.error(e);
      setError("Помилка аналізу: " + e.message);
      setStep('questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto shadow-2xl flex flex-col relative font-sans">
      <header className="sticky top-0 bg-white/90 backdrop-blur-md z-50 px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep('welcome')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white font-black text-sm">H</span></div>
          <span className="font-bold text-lg">HiLLARY AI</span>
        </div>
        <button onClick={() => setStep('history')} className="p-2"><History className="w-5 h-5 text-slate-400" /></button>
      </header>
      <main className="flex-1 overflow-y-auto pb-10">
        {step === 'welcome' && (
          <div className="p-8 text-center mt-20">
            <Sparkles className="w-16 h-16 text-blue-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-4">Розумний догляд</h1>
            <p className="text-slate-500 mb-10 text-sm">ШІ підбере догляд Hillary, проаналізувавши ваше фото та XML сайту.</p>
            <button disabled={productsLoading} onClick={() => setStep('upload')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold transition-all active:scale-95">{productsLoading ? "Завантаження..." : "Почати"}</button>
          </div>
        )}
        {step === 'upload' && (
          <div className="p-6">
            <h2 className="text-xl font-bold mb-6">Крок 1: Фото</h2>
            <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center bg-slate-50">
              <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" id="cam" />
              <label htmlFor="cam" className="cursor-pointer flex flex-col items-center">
                <Camera className="text-blue-500 w-10 h-10 mb-4" />
                <span className="font-bold">Зробити селфі</span>
              </label>
            </div>
            {error && <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold">{error}</div>}
          </div>
        )}
        {step === 'questions' && (
          <div className="p-6 space-y-6">
            <h2 className="text-xl font-bold">Крок 2: Деталі</h2>
            <input type="number" placeholder="Вік" className="w-full p-4 border rounded-xl outline-none focus:border-blue-500" onChange={(e) => setUserData({...userData, age: e.target.value})} />
            <div className="grid grid-cols-2 gap-2">
              {['Суха', 'Жирна', 'Комбінована', 'Не знаю'].map(t => (
                <button key={t} onClick={() => setUserData({...userData, skinType: t})} className={`p-3 border rounded-xl text-xs font-bold transition-all ${userData.skinType === t ? 'border-blue-600 bg-blue-50 text-blue-600' : ''}`}>{t}</button>
              ))}
            </div>
            <textarea placeholder="Що вас турбує?" className="w-full p-4 border rounded-xl h-24 outline-none focus:border-blue-500" onChange={(e) => setUserData({...userData, concerns: e.target.value})} />
            {error && <div className="p-3 bg-red-50 text-red-600 text-[10px] font-bold rounded-lg">{error}</div>}
            <button onClick={startAnalysis} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg">Отримати рекомендації</button>
          </div>
        )}
        {step === 'analyzing' && <div className="p-20 text-center mt-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4"/><p className="font-bold text-slate-400">Аналізуємо шкіру...</p></div>}
        {step === 'results' && (
          <div className="p-6 animate-in fade-in">
            <img src={image} className="w-full h-48 object-cover rounded-3xl mb-6 shadow-lg" />
            <div className="bg-white border rounded-3xl p-6 mb-8 shadow-sm">
              <h3 className="font-bold mb-2 text-slate-800">Висновок</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">{analysis?.skin_condition}</p>
              <div className="bg-blue-50 p-4 rounded-xl text-blue-800 text-xs italic">"{analysis?.advice}"</div>
            </div>
            <h3 className="font-bold mb-4 px-2 text-slate-800">Рекомендовано:</h3>
            <div className="space-y-4">
              {recommendations.map(p => (
                <div key={p.id} className="border p-4 rounded-2xl flex justify-between items-center bg-white shadow-sm">
                  <div className="flex-1 pr-4">
                    <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">АРТ: {p.id}</p>
                    <h4 className="font-bold text-sm leading-tight mb-1">{p.name}</h4>
                    <p className="font-bold text-blue-600">{p.price} грн</p>
                  </div>
                  <a href={p.link} target="_blank" className="bg-blue-50 p-3 rounded-full text-blue-600 hover:bg-blue-600 hover:text-white transition-all"><ExternalLink className="w-5 h-5" /></a>
                </div>
              ))}
            </div>
            <button onClick={() => setStep('welcome')} className="w-full mt-10 py-3 text-slate-400 font-bold uppercase text-[10px] tracking-widest">Новий аналіз</button>
          </div>
        )}
        {step === 'history' && (
          <div className="p-6 animate-in slide-in-from-left-5">
            <button onClick={() => setStep('welcome')} className="mb-6 flex items-center gap-2 text-slate-400 text-xs font-bold uppercase"><ArrowLeft className="w-4 h-4"/> Назад</button>
            <h2 className="text-xl font-bold mb-6">Історія</h2>
            {pastAnalyses.length === 0 ? <p className="text-center text-slate-300 py-10 font-bold uppercase text-xs">Поки порожньо</p> : pastAnalyses.map(item => (
              <div key={item.id} className="border p-3 rounded-2xl mb-3 flex items-center gap-3 bg-white shadow-sm">
                <img src={item.userPhoto} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400">{new Date(item.date).toLocaleDateString()}</p>
                  <h4 className="font-bold text-xs truncate">{item.analysis.skin_type} тип</h4>
                </div>
                <button onClick={() => { setAnalysis(item.analysis); setImage(item.userPhoto); setRecommendations(hillaryProducts.filter(p => item.recommendationIds.includes(p.id))); setStep('results'); }} className="text-blue-600 text-[10px] font-bold uppercase px-2 py-1 bg-blue-50 rounded-lg">Дивитись</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
