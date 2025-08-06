
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Chat } from '@google/genai';
import { Header } from './components/Header';
import { ChatInterface } from './components/ChatInterface';
import { VoiceSelector } from './components/VoiceSelector';
import { initChat, streamMessage } from './services/geminiService';
import { getElevenLabsVoices, streamElevenLabsAudio } from './services/elevenLabsService';
import type { VoiceOption, ChatMessage } from './types';
import { Sender } from './types';
import { VOICES, INITIAL_GREETING } from './constants';

type ElevenLabsStatus = 'loading' | 'success' | 'error';

const App: React.FC = () => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const storedMessages = localStorage.getItem('shrek_ai_chat_history');
      if (storedMessages) {
        const parsedMessages = JSON.parse(storedMessages);
        return parsedMessages.length > 0 ? parsedMessages : [{ id: 'initial', text: INITIAL_GREETING, sender: Sender.AI }];
      }
    } catch (error) {
      console.error("Could not parse chat history:", error);
    }
    return [{ id: 'initial', text: INITIAL_GREETING, sender: Sender.AI }];
  });

  const [apiIsLoading, setApiIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elevenLabsStatus, setElevenLabsStatus] = useState<ElevenLabsStatus>('loading');


  useEffect(() => {
    // Check for Gemini API key
    if (!process.env.API_KEY) {
      setError("מפתח Gemini API חסר. אנא הגדר אותו כמשתנה סביבה.");
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const onPlay = () => setIsSpeaking(true);
    const onPause = () => setIsSpeaking(false);
    const onEnded = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        setCurrentAudioUrl(null);
      }
    };
    
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
    };
  }, [currentAudioUrl]);

  useEffect(() => {
    try {
      localStorage.setItem('shrek_ai_chat_history', JSON.stringify(messages));
    } catch (error) {
      console.error("Could not save chat history:", error);
    }
  }, [messages]);
  
  const mappedVoices = useMemo<VoiceOption[]>(() => {
    if (elevenLabsStatus === 'loading') {
      return VOICES.map(v => ({ ...v, available: false, apiName: 'טוען...' }));
    }
    if (elevenLabsStatus === 'error' || elevenLabsVoices.length === 0) {
      return VOICES.map(v => ({ ...v, available: false, apiName: 'לא זמין' }));
    }
    return VOICES.map((v) => {
      const foundVoice = elevenLabsVoices.find(ev => ev.voice_id === v.voiceId);
      return { 
        ...v, 
        available: !!foundVoice,
        apiName: foundVoice ? foundVoice.name : 'לא נמצא'
      };
    });
  }, [elevenLabsVoices, elevenLabsStatus]);

  useEffect(() => {
    const fetchVoices = async () => {
      setElevenLabsStatus('loading');
      try {
        const voices = await getElevenLabsVoices();
        setElevenLabsVoices(voices);
        setElevenLabsStatus('success');
      } catch (e) {
        console.error(e);
        setElevenLabsStatus('error');
        if (e instanceof Error) {
            setError(e.message);
        } else {
            setError("שגיאה בטעינת קולות מ-ElevenLabs. בדוק את מפתח ה-API והחיבור לרשת.");
        }
      }
    };
    if (!error) {
      fetchVoices();
    }
  }, [error]);

  useEffect(() => {
    if (!selectedVoice && mappedVoices.length > 0) {
      const firstAvailable = mappedVoices.find(v => v.available);
      if (firstAvailable) {
        setSelectedVoice(firstAvailable);
      }
    }
  }, [mappedVoices, selectedVoice]);

  useEffect(() => {
    const initialize = async () => {
      if(error) return;
      try {
        const chatSession = await initChat();
        setChat(chatSession);
      } catch (e) {
        console.error("Failed to initialize chat:", e);
        setError("החיבור לשרק-AI נכשל. אנא בדקו את חיבור האינטרנט וודאו שמפתח ה-API של Gemini הוגדר כהלכה.");
      } finally {
        setIsChatLoading(false);
      }
    };
    initialize();
  }, [error]);

  const handleVoiceChange = (voiceName: string) => {
    if (isSpeaking) stopSpeaking();
    const newVoice = mappedVoices.find(v => v.name === voiceName);
    if (newVoice) {
      setSelectedVoice(newVoice);
    }
  };

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeakingMessageId(null);
  }, []);

  const handleSpeak = useCallback(async (text: string, messageId: string) => {
    if (!selectedVoice || !text.trim()) return;

    if (isSpeaking) {
      stopSpeaking();
    }
    
    setSpeakingMessageId(messageId);
    try {
      const audioBlob = await streamElevenLabsAudio(text, selectedVoice.voiceId);
      if (audioBlob && audioRef.current) {
        const url = URL.createObjectURL(audioBlob);
        setCurrentAudioUrl(url);
        audioRef.current.src = url;
        audioRef.current.play().catch(e => console.error("Error playing audio:", e));
      } else {
        setSpeakingMessageId(null);
      }
    } catch (e) {
      console.error("Failed to stream audio", e);
      setError("שגיאה בהפקת הדיבור. אנא נסה שוב.");
      setSpeakingMessageId(null);
    }
  }, [selectedVoice, isSpeaking, stopSpeaking]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!chat || !text.trim()) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), text, sender: Sender.User };
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessagePlaceholder: ChatMessage = { id: aiMessageId, text: '', sender: Sender.AI };

    setMessages(prev => [...prev, userMessage, aiMessagePlaceholder]);
    setApiIsLoading(true);

    try {
      let fullResponse = '';
      const responseStream = await streamMessage(chat, text);

      for await (const chunk of responseStream) {
        fullResponse += chunk;
        setMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageId ? { ...msg, text: fullResponse } : msg
          )
        );
      }
      handleSpeak(fullResponse, aiMessageId);
    } catch (e) {
      console.error('Error streaming message:', e);
      const errorMessage = "אני מצטער, אבל אני מתקשה להתחבר כרגע. אנא נסה שוב מאוחר יותר.";
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, text: errorMessage, sender: Sender.AI } : msg
        )
      );
    } finally {
      setApiIsLoading(false);
    }
  }, [chat, handleSpeak]);

  const renderContent = () => {
    if (error && elevenLabsStatus === 'error') {
      return (
        <div className="flex-1 flex items-center justify-center text-center p-4">
          <p className="text-red-400">{error}</p>
        </div>
      );
    }
    if (isChatLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p>יוצר חיבור רוחני...</p>
        </div>
      );
    }
    return (
      <ChatInterface 
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={apiIsLoading}
        isSpeaking={isSpeaking}
        stopSpeaking={stopSpeaking}
        speakingMessageId={speakingMessageId}
      />
    );
  }

  return (
    <div className="bg-gray-900 min-h-screen text-gray-200 flex flex-col items-center p-4 selection:bg-yellow-500 selection:text-black">
      <div className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
        <Header />
        <div className="flex-grow flex flex-col md:flex-row gap-6 mt-4 overflow-hidden">
          <aside className="md:w-1/4 flex-shrink-0 bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex flex-col">
            <h2 className="text-lg font-bold text-yellow-400 mb-4">בחירת קול</h2>
            <div className="flex-grow">
              <VoiceSelector
                voices={mappedVoices}
                selectedVoice={selectedVoice?.name || ''}
                onVoiceChange={handleVoiceChange}
                disabled={isSpeaking || elevenLabsStatus !== 'success'}
              />
            </div>
            <div className="mt-4 text-xs text-center">
              {elevenLabsStatus === 'loading' && <p className="text-gray-400 animate-pulse">מתחבר לשירות הקולות...</p>}
              {elevenLabsStatus === 'success' && <p className="text-green-400 font-semibold">✓ קולות ElevenLabs מחוברים</p>}
              {elevenLabsStatus === 'error' && <p className="text-red-400 font-semibold">X חיבור נכשל</p>}
              <p className="text-gray-500 mt-1">
                מופעל על ידי ElevenLabs
              </p>
            </div>
          </aside>
          <main className="flex-grow flex flex-col bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
