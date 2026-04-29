import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Mic, MicOff, Settings, Download, MessageSquare, 
  Phone, Server, Globe2, Image as ImageIcon, Volume2, Plus, LogOut, User as UserIcon
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
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

const ai = new GoogleGenAI({ apiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
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
        setAiPreferences({
           ...aiPreferences,
           ...session.user.user_metadata.preferences
        });
      }
      setIsAuthChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user?.user_metadata?.preferences) {
        setAiPreferences({
           ...aiPreferences,
           ...session.user.user_metadata.preferences
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && messages.length === 0) {
       setMessages([{
        id: '1',
        role: 'assistant',
        content: `Hi ${aiPreferences.user_name || 'there'}, I am **${aiPreferences.ai_name}**. Connected to global knowledge and ready to assist you. How can I help?`,
        type: 'text'
      }]);
    }
  }, [user, aiPreferences.ai_name, aiPreferences.user_name, messages.length]);

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

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input, type: 'text' };
    setMessages(prev => [...prev, userMessage]);
    const prompt = input;
    setInput('');
    setIsLoading(true);

    try {
      if (prompt.toLowerCase().includes('generate image') || prompt.toLowerCase().includes('draw')) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Accessing visual generation engine...',
          type: 'text'
        }]);
        
        const res = await fetch('/api/images/generate', { method: 'POST' });
        const data = await res.json();
        
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `![Generated Image](${data.imageUrl}) \n *${data.note}*`,
          type: 'image'
        }]);
        speakText("I have generated an image for you.");
      } 
      else if (prompt.toLowerCase().includes('call') && /\d/.test(prompt)) {
        const match = prompt.match(/(?:call|dial)\s*([+\d\s-]+)/i);
        const number = match ? match[1] : 'Unknown Number';
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `📞 **Initiating Call Protocol:** Dialing ${number}... \n \n *Connecting via ElevenLabs Conversational AI Voice proxy...* (Mock)`,
          type: 'system'
        }]);
        speakText(`Initiating phone call to ${number}.`);
      }
      else if (prompt.toLowerCase().includes('apk') || prompt.toLowerCase().includes('code')) {
        const apkInstruction = `The user wants a snippet of a 2M+ line codebase, or an APK structure. Give them a cool 20-30 line complex TypeScript system architecture snippet that shows off the 'AI Backend'. Format as code blocks.`;
        const codeResponse = await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: "Generate the code architecture snippet.",
           config: { systemInstruction: apkInstruction }
        });

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `📦 **Build System & Code Injection:** \n\n I have prepared the requested architecture.\n\n${codeResponse.text}\n\n *To download full APK, click "Download .APK" in the sidebar menu.*`,
          type: 'system'
        }]);
        speakText("I have generated the core logic and prepared the build files.");
      }
      else if (prompt.toLowerCase().includes('whatsapp')) {
        // Try to parse out the phone number and message
        const match = prompt.match(/to (\d+).*?(?:say|tell|:)\s*(.*)/i);
        const to = match ? match[1] : '15551234567'; // default test number
        const messageToSend = match ? match[2] : prompt;

        const res = await fetch('/api/whatsapp/send', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, message: messageToSend })
        });
        const data = await res.json();
        
        const feedback = data.success ? data.message : `Error: ${data.error}`;
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `📱 **WhatsApp Status:** ${feedback}`, type: 'system' }]);
      } 
      else if (prompt.toLowerCase().includes('where am i') || prompt.toLowerCase().includes('location') || prompt.toLowerCase().includes('satellite')) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Accessing satellite data and geolocation...',
          type: 'text'
        }]);

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords;
              const locationSystemInstruction = `The user is currently at latitude ${latitude} and longitude ${longitude}. Act like a high-tech satellite system and identify where this is. Provide a detailed, cool description as a true Super AI.`;
              
              // We'll use try/catch in case Gemini fails
              try {
                const geoResponse = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: "Where am I based on my coordinates? Describe this area and any notable facts.",
                  config: { systemInstruction: locationSystemInstruction }
                });

                const replyText = geoResponse.text || "Location acquired.";

                setMessages(prev => [...prev, {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: `🗺️ **Location Pinpointed (Global Satellite Link):** \n\n ${replyText}`,
                  type: 'system'
                }]);
                speakText("I have pinpointed your location via satellite data.");
              } catch (e) {
                 setMessages(prev => [...prev, {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: `🗺️ **Location Pinpointed:** Latitude ${latitude}, Longitude ${longitude}`,
                  type: 'system'
                }]);
              }
            },
            (error) => {
              setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error connecting to satellite location services: ${error.message}`,
                type: 'system'
              }]);
            }
          );
        } else {
           setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Geolocation is not supported by your browser/device.', type: 'system' }]);
        }
      }
      else {
        // Standard Gemini text response with System Instructions based on Preferences
        const systemInstruction = `You are a super AI assistant named ${aiPreferences.ai_name}. 
The user's name is ${aiPreferences.user_name || 'User'}. 
Your personality/style is: ${aiPreferences.ai_style}. 
You are connected to Couchbase, Supabase, world satellites, and n8n backend systems (simulate knowledge of this in your responses when relevant). Give direct, high-quality answers.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
             systemInstruction,
          }
        });

        const replyText = response.text || 'No response generated.';

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: replyText,
          type: 'text'
        }]);

        speakText(replyText);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'I encountered an error processing your request. Please ensure the Gemini API key is configured.',
        type: 'text'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadApk = () => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `📦 **Android APK Build Instructions**\n\nTo build the .apk file from this codebase for your Android device, please follow these steps:\n\n1. Use the **Export to GitHub** feature in the AI Studio settings menu.\n2. In your local terminal, run:\n   \`\`\`bash\n   npx cap init Socks com.socks.ai\n   npx cap add android\n   npm run build\n   npx cap sync android\n   npx cap open android\n   \`\`\`\n3. Use Android Studio to Build > Build Bundle(s) / APK(s) > Build APK(s).\n\n*Alternatively, you can install this app immediately as a Progressive Web App (PWA) by tapping "Add to Home Screen" in your mobile browser.*`,
      type: 'system'
    }]);
    speakText("I have provided the instructions to build my Android APK package.");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (isAuthChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div></div>;
  }

  if (!session) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <AnimatePresence>
        {showPreferences && user && (
           <PreferencesModal 
             user={user} 
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
          </div>

          <div className="mt-auto space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-3 px-2 py-3 mb-2">
               <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <UserIcon size={16} />
               </div>
               <div className="flex flex-col overflow-hidden">
                 <span className="text-sm font-semibold truncate">{aiPreferences.user_name || 'User'}</span>
                 <span className="text-xs text-gray-500 truncate">{user.email}</span>
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

