import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Mic, MicOff, Settings, Download, MessageSquare, 
  Phone, Server, Globe2, Image as ImageIcon, Volume2, Plus, LogOut, User as UserIcon
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import Auth from './components/Auth';
import PreferencesModal from './components/PreferencesModal';

// ==============================================
// SOCKS - Super AI Assistant
// ==============================================

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'image' | 'voice' | 'system';
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [aiPreferences, setAiPreferences] = useState({
    ai_style: 'helpful and concise',
    ai_name: 'Socks',
    voice_enabled: true,
    user_name: ''
  });

  const [learnedFacts, setLearnedFacts] = useState<string[]>(() => {
    const saved = localStorage.getItem('socks_learned_facts');
    return saved ? JSON.parse(saved) : [];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Speech Recognition Mock / Web API
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  if (recognition) {
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user?.user_metadata?.preferences) {
        setAiPreferences(prev => ({
           ...prev,
           ...session.user.user_metadata.preferences
        }));
      }
      setIsAuthChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user?.user_metadata?.preferences) {
        setAiPreferences(prev => ({
           ...prev,
           ...session.user.user_metadata.preferences
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isGuestMode) {
      const guestPrefs = localStorage.getItem('socks_guest_preferences');
      if (guestPrefs) {
         setAiPreferences(prev => ({...prev, ...JSON.parse(guestPrefs)}));
      }
    }
  }, [isGuestMode]);

  useEffect(() => {
    if ((user || isGuestMode) && messages.length === 0) {
       setMessages([{
        id: '1',
        role: 'assistant',
        content: `Hi ${aiPreferences.user_name || 'there'}, I am **${aiPreferences.ai_name}**. Connected to global knowledge and ready to assist you. How can I help?`,
        type: 'text'
      }]);
    }
  }, [user, isGuestMode, aiPreferences.ai_name, aiPreferences.user_name, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleListen = () => {
    if (!recognition) {
      alert("Speech recognition is not supported in this browser. Try Chrome.");
      return;
    }
    
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };
      
      recognition.onerror = (event: any) => {
        console.error("Speech error", event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
    }
  };

  const speakText = async (text: string) => {
    if (!aiPreferences.voice_enabled) return;
    
    // Basic text cleanup for reading
    const cleanText = text.replace(/[\*\_\[\]\(\)]/g, '');

    try {
      const res = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });
      const data = await res.json();
      
      if (data.success && data.audioUrl) {
         const audio = new Audio(data.audioUrl);
         audio.play();
         return;
      }
    } catch (err) {
      console.error("ElevenLabs error, falling back to browser TTS", err);
    }

    // Fallback to browser TTS if ElevenLabs fails or isn't configured
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voices = window.speechSynthesis.getVoices();
      // Try to find a good English voice
      const preferredVoice = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.lang === 'en-US');
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSend = async (e?: React.FormEvent, textOverride?: string) => {
    e?.preventDefault();
    const prompt = textOverride || input;
    if (!prompt.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: prompt, type: 'text' };
    setMessages(prev => [...prev, userMessage]);
    
    if (!textOverride) setInput('');
    setIsLoading(true);

    try {
      if (prompt.toLowerCase().includes('apk') || prompt.toLowerCase().includes('download')) {
        downloadApk();
        setIsLoading(false);
        return;
      }

      if (prompt.toLowerCase() === 'show brain' || prompt.toLowerCase() === 'view memory') {
        const brainContent = learnedFacts.length > 0 
          ? `🧠 **Current World Brain Knowledge:**\n\n${learnedFacts.map(f => `- ${f}`).join('\n')}`
          : `🧠 **World Brain Knowledge:**\n\nI haven't learned anything specific yet. Tell me something with "learn [fact]" or "remember [fact]".`;
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: brainContent,
          type: 'system'
        }]);
        speakText("Here is what I have learned.");
        setIsLoading(false);
        return;
      }

      if (prompt.toLowerCase().startsWith('learn ') || prompt.toLowerCase().startsWith('remember ')) {
        const fact = prompt.replace(/^learn\s+|^remember\s+/i, '').trim();
        const newFacts = [...learnedFacts, fact];
        setLearnedFacts(newFacts);
        localStorage.setItem('socks_learned_facts', JSON.stringify(newFacts));
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🧠 **World Brain Updated:** I have learned and saved: "${fact}".`,
          type: 'system'
        }]);
        speakText("I have saved this to my memory brain.");
        setIsLoading(false);
        return;
      }

      if (prompt.toLowerCase().startsWith('forget all') || prompt.toLowerCase().startsWith('clear brain')) {
        setLearnedFacts([]);
        localStorage.removeItem('socks_learned_facts');
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🧠 **World Brain Cleared:** All learned facts have been wiped.`,
          type: 'system'
        }]);
        speakText("I have cleared my memory.");
        setIsLoading(false);
        return;
      }

      if (prompt.toLowerCase().includes('whatsapp')) {
        const match = prompt.match(/to\s*(\d+).*?(?:say|tell|:)\s*(.*)/i);
        const to = match ? match[1] : '';
        const msg = match ? match[2] : (prompt.replace(/open whatsapp|whatsapp/ig, '').trim());
        
        let aiTalk = '';
        if (to && msg) {
           aiTalk = `📱 **WhatsApp:** Opening WhatsApp to send a message to ${to}...`;
           window.open(`https://wa.me/${to}?text=${encodeURIComponent(msg)}`, '_blank');
        } else if (msg) {
           aiTalk = `📱 **WhatsApp:** Opening WhatsApp...`;
           window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
           aiTalk = `📱 **WhatsApp:** To send a specific message, type "whatsapp to [number] say [message]". Opening the app...`;
           window.open(`whatsapp://`, '_blank'); // Try deep link
        }
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: aiTalk,
          type: 'system'
        }]);
        speakText("Opening WhatsApp.");
        setIsLoading(false);
        return;
      }

      if (prompt.toLowerCase().startsWith('open ')) {
        const appName = prompt.toLowerCase().replace('open ', '').trim();
        const deepLinks: Record<string, string> = {
          'whatsapp': 'whatsapp://',
          'youtube': 'vnd.youtube://',
          'instagram': 'instagram://',
          'twitter': 'twitter://',
          'maps': 'geo:0,0?q=',
          'spotify': 'spotify://'
        };
        
        const link = deepLinks[appName];
        if (link) {
           window.open(link, '_blank');
           setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Opening ${appName}...`, type: 'system' }]);
           speakText(`Opening ${appName}.`);
        } else {
           setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Sorry, I don't have a direct deep link to open **${appName}** from the browser yet.`, type: 'system' }]);
        }
        setIsLoading(false);
        return;
      }

      const locationSettings = navigator.geolocation ? await new Promise<any>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          () => resolve(null)
        );
      }).catch(() => null) : null;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          preferences: aiPreferences,
          location: locationSettings,
          learnedFacts: learnedFacts
        })
      });

      const data = await res.json();
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.imageUrl ? `![Generated Image](${data.imageUrl})\n*${data.text}*` : data.text,
        type: data.type || 'text'
      }]);

      if (data.text) speakText(data.text);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'I encountered an error processing your request. Please ensure the backend is running.',
        type: 'text'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadApk = () => {
    const instructions = `📦 Android APK Build Instructions

To build the .apk file from this codebase for your Android device, please follow these steps:

1. Use the "Export to GitHub" feature in the AI Studio settings menu, or download the source code as a ZIP.
2. In your local terminal, navigate to the project folder and run:
   > npm install
   > npx cap init Socks com.socks.ai
   > npx cap add android
   > npm run build
   > npx cap sync android
   > npx cap open android
3. Use Android Studio to Build > Build Bundle(s) / APK(s) > Build APK(s).

*Alternatively, you can install this app immediately as a Progressive Web App (PWA) by tapping "Add to Home Screen" in your mobile browser.*
`;

    // Create a Blob and trigger download
    const blob = new Blob([instructions], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SocksAI_SourceInstructions.apk.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `📦 **Downloading APK Build Instructions**\n\nI have generated a text file with complete instructions on how to build the APK. Please check your downloads!`,
      type: 'system'
    }]);
    speakText("I am downloading the instructions to build my Android APK package.");
  };

  const handleSignOut = async () => {
    if (isGuestMode) {
      setIsGuestMode(false);
      return;
    }
    await supabase.auth.signOut();
  };

  if (isAuthChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div></div>;
  }

  if (!session && !isGuestMode) {
    return <Auth onAuthSuccess={() => setIsGuestMode(true)} />;
  }

  const effectiveUserEmail = user?.email || 'guest@world.net';

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <AnimatePresence>
        {showPreferences && (
           <PreferencesModal 
             user={user || { id: 'guest', email: 'guest@world.net' } as any} 
             onClose={() => setShowPreferences(false)} 
             onPreferencesUpdated={(prefs) => setAiPreferences({...aiPreferences, ...prefs})} 
           />
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <motion.div 
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className={cn(
          "bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden shrink-0",
          isSidebarOpen ? "w-[280px]" : "w-0"
        )}
      >
        <div className="p-4 flex flex-col h-full w-[280px]">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight mb-8">
            <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm">
               {aiPreferences.ai_name.charAt(0)}
            </span>
            {aiPreferences.ai_name} OS
          </div>
          
          <div className="space-y-4 flex-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Capabilities</div>
            <FeatureItem icon={<Globe2 size={18} />} text="World Data Centers" />
            <FeatureItem icon={<Server size={18} />} text="Couchbase Lite / Supabase" />
            <FeatureItem icon={<MessageSquare size={18} />} text="WhatsApp Integration" />
            <FeatureItem icon={<Phone size={18} />} text="ElevenLabs Voice" />
            <FeatureItem icon={<ImageIcon size={18} />} text="Image Generation" />
            <div className="flex items-center gap-3 p-2 text-gray-600 hover:text-black hover:bg-gray-50 rounded-xl transition-all cursor-pointer" onClick={() => handleSend(undefined, 'show brain')}>
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 shadow-sm border border-indigo-200 border-b-2">
                <span className="text-lg">🧠</span>
              </div>
              <span className="text-sm font-medium">World Brain Memory <span className="text-xs text-gray-400 ml-1">({learnedFacts.length})</span></span>
            </div>
          </div>

          <div className="mt-auto space-y-2 border-t border-gray-100 pt-4">
             <div className="flex items-center gap-3 px-2 py-3 mb-2">
               <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <UserIcon size={16} />
               </div>
               <div className="flex flex-col overflow-hidden">
                 <span className="text-sm font-semibold truncate">{aiPreferences.user_name || 'User'}</span>
                 <span className="text-xs text-gray-500 truncate">{effectiveUserEmail}</span>
               </div>
            </div>

            <button 
              onClick={() => setShowPreferences(true)}
              className="flex items-center gap-2 w-full p-3 hover:bg-gray-100 rounded-xl transition-colors text-sm font-medium text-gray-700"
            >
              <Settings size={18} />
              Preferences
            </button>

            <button 
              onClick={downloadApk}
              className="flex items-center gap-2 w-full p-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl transition-colors text-sm font-medium"
            >
              <Download size={18} />
              Download .APK
            </button>
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-2 w-full p-3 hover:bg-red-50 text-red-600 rounded-xl transition-colors text-sm font-medium"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full w-full relative transition-all duration-300 min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b border-gray-200/50 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors hidden sm:block"
            >
              <Settings size={20} className="text-gray-600" />
            </button>
            <span className="font-semibold text-lg tracking-tight">{aiPreferences.ai_name}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium bg-green-100 text-green-700 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Connected
            </div>
            {/* Mobile Sidebar Toggle */}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 sm:hidden hover:bg-gray-100 rounded-full transition-colors"
            >
              <Settings size={20} className="text-gray-600" />
            </button>
          </div>
        </header>

        {/* Chat History */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={cn(
                  "flex w-full gap-4",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-black flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                    {aiPreferences.ai_name.charAt(0)}
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm",
                  msg.role === 'user' 
                    ? "bg-gray-100 text-gray-900 rounded-tr-sm" 
                    : "bg-white border border-gray-100 rounded-tl-sm"
                )}>
                  <div className="prose prose-sm max-w-none break-words
                    prose-p:leading-relaxed prose-pre:bg-gray-50 prose-pre:text-gray-900 prose-pre:border prose-pre:border-gray-200
                    prose-img:rounded-xl prose-img:shadow-sm prose-img:w-full prose-img:max-w-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  
                  {msg.role === 'assistant' && msg.type !== 'system' && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                      <button 
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-50" 
                        title="Read Aloud"
                        onClick={() => speakText(msg.content)}
                      >
                        <Volume2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-black flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                  {aiPreferences.ai_name.charAt(0)}
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-4 w-16 flex items-center justify-center gap-1 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} className="h-px" />
        </main>

        {/* Input Area */}
        <div className="p-4 sm:p-6 bg-white border-t border-gray-100 w-full max-w-4xl mx-auto shrink-0">
          <form onSubmit={handleSend} className="relative flex items-center shadow-sm rounded-full bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors focus-within:border-black focus-within:ring-1 focus-within:ring-black">
            
            <button 
              type="button"
              className="absolute left-2 p-2.5 text-gray-400 hover:text-gray-700 transition-colors rounded-full hover:bg-white"
              title="Add Attachment"
            >
              <Plus size={20} />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${aiPreferences.ai_name} to code, text, or search...`}
              className="w-full bg-transparent border-none py-4 px-14 focus:outline-none placeholder:text-gray-400 text-[15px]"
            />
            
            <div className="absolute right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={toggleListen}
                className={cn(
                  "p-2.5 rounded-full transition-all",
                  isListening 
                    ? "bg-red-100 text-red-600 animate-pulse" 
                    : "text-gray-400 hover:text-black hover:bg-white"
                )}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-black text-white p-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:hover:bg-black mr-1"
              >
                <Send size={18} className="translate-x-[-1px] translate-y-[1px]" />
              </button>
            </div>
          </form>
          <div className="text-center mt-3 text-xs text-gray-400">
            {aiPreferences.ai_name} processes queries using cloud servers and global data.
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 p-2 text-gray-600 hover:text-black hover:bg-gray-50 rounded-xl transition-all cursor-default">
      <div className="p-2 bg-gray-100 rounded-lg text-gray-500 shadow-sm border border-gray-200 border-b-2">
        {icon}
      </div>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

