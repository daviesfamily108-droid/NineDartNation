import React, { useState } from 'react';
import { HelpCircle, MessageCircle, X, Send } from 'lucide-react';

interface HelpAssistantProps {}

export default function HelpAssistant({}: HelpAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{text: string, isUser: boolean}>>([
    { text: "Hi! I'm your Nine Dart Nation assistant. How can I help you today?", isUser: false }
  ]);
  const [input, setInput] = useState('');

  const faq = {
    'how to play': 'To play darts, select a game mode from the menu. For online play, join a match. For offline, start a local game.',
    'calibration': 'Go to Settings > Camera & Vision > Calibration Guide to set up your camera properly.',
    'premium': 'Premium unlocks all game modes. Click the "Upgrade to PREMIUM" button in online play.',
    'username': 'Change your username once for free in Settings > Account.',
    'voice': 'Enable voice caller in Settings > Audio & Voice. Test the voice with the Test Voice button.',
    'friends': 'Add friends in the Friends tab to play together.',
    'stats': 'View your statistics in the Stats tab.',
    'settings': 'Customize your experience in the Settings panel.',
    'support': 'Contact support via email or check the FAQ in Settings > Support.',
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMessage = input.toLowerCase();
    setMessages(prev => [...prev, { text: input, isUser: true }]);
    setInput('');

    // Simple response logic
    let response = "I'm not sure about that. Try asking about playing, calibration, premium, or settings.";

    for (const [key, answer] of Object.entries(faq)) {
      if (userMessage.includes(key)) {
        response = answer;
        break;
      }
    }

    setTimeout(() => {
      setMessages(prev => [...prev, { text: response, isUser: false }]);
    }, 500);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-colors"
        title="Help Assistant"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative bg-slate-800 rounded-lg shadow-xl w-full max-w-md h-96 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-blue-400" />
                <span className="font-semibold">Help Assistant</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-3 py-2 rounded-lg ${
                    msg.isUser 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-700 text-slate-200'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything..."
                  className="flex-1 input"
                />
                <button
                  onClick={handleSend}
                  className="btn bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}