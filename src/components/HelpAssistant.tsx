import React, { useState } from 'react';
import { HelpCircle, MessageCircle, X, Send } from 'lucide-react';

interface HelpAssistantProps {}

export default function HelpAssistant({}: HelpAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{text: string | {text: string, links?: Array<{text: string, tab: string}>}, isUser: boolean}>>([
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

  const navigateToTab = (tabKey: string) => {
    try {
      window.dispatchEvent(new CustomEvent('ndn:change-tab', { detail: { tab: tabKey } }));
      setIsOpen(false); // Close the help modal after navigation
    } catch (error) {
      console.error('Navigation failed:', error);
    }
  };

  const getResponseWithLinks = (userMessage: string): { text: string, links?: Array<{ text: string, tab: string }> } => {
    const message = userMessage.toLowerCase();

    if (message.includes('username') || message.includes('change name')) {
      return {
        text: 'You can change your username once for free.',
        links: [{ text: 'Go to Settings > Account', tab: 'settings' }]
      };
    }
    if (message.includes('premium') || message.includes('upgrade') || message.includes('subscription')) {
      return {
        text: 'Premium unlocks all game modes and features.',
        links: [{ text: 'Go to Online Play', tab: 'online' }]
      };
    }
    if (message.includes('calibrat') || message.includes('camera') || message.includes('vision')) {
      return {
        text: 'Set up your camera properly in Settings.',
        links: [{ text: 'Go to Settings > Camera & Vision', tab: 'settings' }]
      };
    }
    if (message.includes('voice') || message.includes('caller') || message.includes('audio')) {
      return {
        text: 'Enable voice calling in Settings.',
        links: [{ text: 'Go to Settings > Audio & Voice', tab: 'settings' }]
      };
    }
    if (message.includes('friend') || message.includes('play together')) {
      return {
        text: 'Add friends to play together.',
        links: [{ text: 'Go to Friends', tab: 'friends' }]
      };
    }
    if (message.includes('stat') || message.includes('score') || message.includes('performance')) {
      return {
        text: 'View your statistics and performance.',
        links: [{ text: 'Go to Stats', tab: 'stats' }]
      };
    }
    if (message.includes('setting') || message.includes('customiz') || message.includes('configur')) {
      return {
        text: 'Customize your experience.',
        links: [{ text: 'Go to Settings', tab: 'settings' }]
      };
    }
    if (message.includes('tournament') || message.includes('competition')) {
      return {
        text: 'Check out tournaments and competitions.',
        links: [{ text: 'Go to Tournaments', tab: 'tournaments' }]
      };
    }
    if (message.includes('help') || message.includes('support') || message.includes('faq')) {
      return {
        text: 'You\'re already in the help section! Check Settings for more resources.',
        links: [{ text: 'Go to Settings > Support', tab: 'settings' }]
      };
    }
    if (message.includes('how to play') || message.includes('game') || message.includes('start')) {
      return {
        text: 'To play darts, select a game mode from the menu. For online play, join a match. For offline, start a local game.',
        links: [
          { text: 'Play Online', tab: 'online' },
          { text: 'Play Offline', tab: 'offline' }
        ]
      };
    }

    return { text: "I'm not sure about that. Try asking about playing, calibration, premium, username changes, voice settings, friends, stats, or settings." };
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMessage = input.toLowerCase();
    setMessages(prev => [...prev, { text: input, isUser: true }]);
    setInput('');

    // Get response with smart link suggestions
    const response = getResponseWithLinks(userMessage);

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
                    {typeof msg.text === 'string' ? (
                      msg.text
                    ) : (
                      <div className="space-y-2">
                        <div>{msg.text.text}</div>
                        {msg.text.links && (
                          <div className="space-y-1">
                            {msg.text.links.map((link, linkIndex) => (
                              <button
                                key={linkIndex}
                                onClick={() => navigateToTab(link.tab)}
                                className="block w-full text-left text-blue-300 hover:text-blue-200 underline text-sm"
                              >
                                {link.text}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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