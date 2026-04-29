import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { X, Save, User as UserIcon, Mic, Palette } from 'lucide-react';
import { User } from '@supabase/supabase-js';

export default function PreferencesModal({ 
  user, 
  onClose,
  onPreferencesUpdated
}: { 
  user: User; 
  onClose: () => void;
  onPreferencesUpdated: (prefs: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState({
    ai_style: 'helpful and concise',
    ai_name: 'Socks',
    voice_enabled: true,
    user_name: ''
  });

  useEffect(() => {
    if (user?.id === 'guest') {
       const guestPrefs = localStorage.getItem('socks_guest_preferences');
       if (guestPrefs) setPreferences(JSON.parse(guestPrefs));
    } else if (user?.user_metadata?.preferences) {
      setPreferences(prev => ({
        ...prev,
        ...user.user_metadata.preferences
      }));
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (user?.id === 'guest') {
        localStorage.setItem('socks_guest_preferences', JSON.stringify(preferences));
        onPreferencesUpdated(preferences);
        onClose();
        return;
      }
      
      const { data, error } = await supabase.auth.updateUser({
        data: { preferences }
      });
      if (error) throw error;
      onPreferencesUpdated(preferences);
      onClose();
    } catch (err: any) {
      alert('Error updating preferences: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden font-sans"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold tracking-tight">AI Preferences</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <UserIcon size={16} className="text-gray-400" />
              Your Name
            </label>
            <input 
              type="text" 
              value={preferences.user_name}
              onChange={e => setPreferences({...preferences, user_name: e.target.value})}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-black focus:outline-none transition-all"
              placeholder="How should the AI address you?"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Palette size={16} className="text-gray-400" />
              AI Personality / Style
            </label>
            <textarea 
              value={preferences.ai_style}
              onChange={e => setPreferences({...preferences, ai_style: e.target.value})}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-black focus:outline-none transition-all resize-none h-24 text-sm"
              placeholder="E.g. Professional, snarky, poetic, extremely brief..."
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex gap-3">
              <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100 h-fit">
                <Mic size={18} className="text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Voice Output</h4>
                <p className="text-xs text-gray-500">Enable AI to speak its responses aloud</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={preferences.voice_enabled}
                onChange={e => setPreferences({...preferences, voice_enabled: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
