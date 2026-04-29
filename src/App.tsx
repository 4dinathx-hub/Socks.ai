import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Mic, MicOff, Settings, Download, MessageSquare, 
  Phone, Server, Globe2, Image as ImageIcon, Volume2, Plus
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// ==============================================
// SOCKS - Super AI Assistant
// Architecture setup simulating a 2M+ line app
// ==============================================

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'image' | 'voice' | 'system';
};

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi, I am **Socks**. Your advanced AI. I am connected to global knowledge, can generate images, and assist you. How can I help today?',
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleListen = () => {
    if (!recognition) {
      alert("Speech recognition is not supported in this browser.");
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

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input, type: 'text' };
    setMessages(prev => [...prev, userMessage]);
    const prompt = input;
    setInput('');
    setIsLoading(true);

    try {
      // 1. Handling specific commands (Mocking 2M line capabilities)
      if (prompt.toLowerCase().includes('generate image')) {
        // Image Generation flow
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Generating your image based on background contexts...',
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
      } 
      else if (prompt.toLowerCase().includes('whatsapp')) {
        const res = await fetch('/api/whatsapp/send', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'user', message: prompt })
        });
        const data = await res.json();
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `📱 **WhatsApp:** ${data.message}`, type: 'system' }]);
      }
      else {
        // Standard Gemini text response
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: response.text || 'No response generated.',
          type: 'text'
        }]);
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
    alert("In a real environment, this triggers an Expo/React Native build to package the PWA into a downloadable .apk file. For now, you can 'Add to Home Screen' via your browser menu to install Socks as a PWA.");
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <motion.div 
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className={cn(
          "bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden",
          isSidebarOpen ? "w-[280px]" : "w-0"
        )}
      >
        <div className="p-4 flex flex-col h-full w-[280px]">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight mb-8">
            <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm">S</span>
            Socks OS
          </div>
          
          <div className="space-y-4 flex-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Capabilities</div>
            <FeatureItem icon={<Globe2 size={18} />} text="World Data Centers" />
            <FeatureItem icon={<Server size={18} />} text="Couchbase Lite / Supabase" />
            <FeatureItem icon={<MessageSquare size={18} />} text="WhatsApp Integration" />
            <FeatureItem icon={<Phone size={18} />} text="ElevenLabs Voice" />
            <FeatureItem icon={<ImageIcon size={18} />} text="Image Generation" />
          </div>

          <div className="mt-auto space-y-2">
            <button 
              onClick={downloadApk}
              className="flex items-center gap-2 w-full p-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl transition-colors text-sm font-medium"
            >
              <Download size={18} />
              Download .APK
            </button>
            <button className="flex items-center gap-2 w-full p-3 hover:bg-gray-100 rounded-xl transition-colors text-sm font-medium text-gray-700">
              <Settings size={18} />
              Settings
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full w-full relative transition-all duration-300">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b border-gray-200/50">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors hidden sm:block"
            >
              <Settings size={20} className="text-gray-600" />
            </button>
            <span className="font-semibold text-lg tracking-tight">Socks</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium bg-green-100 text-green-700 px-2.5 py-1 rounded-full flex items-center gap-1.5">
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
                  <div className="w-8 h-8 rounded-full bg-black flex-shrink-0 flex items-center justify-center text-white font-bold text-xs">
                    S
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm",
                  msg.role === 'user' 
                    ? "bg-gray-100 text-gray-900 rounded-tr-sm" 
                    : "bg-white border border-gray-100 rounded-tl-sm"
                )}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    className="prose prose-sm max-w-none break-words
                    prose-p:leading-relaxed prose-pre:bg-gray-50 prose-pre:text-gray-900 prose-pre:border prose-pre:border-gray-200
                    prose-img:rounded-xl prose-img:shadow-sm prose-img:w-full prose-img:max-w-sm"
                  >
                    {msg.content}
                  </ReactMarkdown>
                  
                  {msg.role === 'assistant' && msg.type !== 'system' && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button className="text-gray-400 hover:text-gray-600 transition-colors p-1" title="Read Aloud">
                        <Volume2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-black flex-shrink-0 flex items-center justify-center text-white font-bold text-xs">S</div>
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
        <div className="p-4 sm:p-6 bg-white border-t border-gray-100 w-full max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="relative flex items-center">
            
            <button 
              type="button"
              className="absolute left-3 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
              title="Add Attachment"
            >
              <Plus size={20} />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Socks to code, generate image, or search world data..."
              className="w-full bg-gray-100 border-none rounded-full py-4 pl-12 pr-28 focus:ring-2 focus:ring-black focus:outline-none transition-all placeholder:text-gray-500 text-[15px]"
            />
            
            <div className="absolute right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={toggleListen}
                className={cn(
                  "p-2.5 rounded-full transition-all",
                  isListening 
                    ? "bg-red-100 text-red-600 animate-pulse" 
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
                )}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-black text-white p-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:hover:bg-black"
              >
                <Send size={18} className="translate-x-[-1px] translate-y-[1px]" />
              </button>
            </div>
          </form>
          <div className="text-center mt-3 text-xs text-gray-400">
            Socks can make mistakes. Consider verifying critical world data.
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 p-2 text-gray-600 hover:text-black hover:bg-gray-50 rounded-xl transition-all cursor-default">
      <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
        {icon}
      </div>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

