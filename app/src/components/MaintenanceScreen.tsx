import { useEffect, useState } from 'react';

interface MaintenanceScreenProps {
  message?: string;
  estimatedTime?: string;
  showContact?: boolean;
}

export default function MaintenanceScreen({
  message = "We're currently performing scheduled maintenance to improve your experience.",
  estimatedTime = "approximately 30 minutes",
  showContact = true
}: MaintenanceScreenProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 text-center">
        {/* Maintenance Icon */}
        <div className="w-16 h-16 mx-auto mb-6 bg-amber-500/20 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-4">
          Scheduled Maintenance
        </h1>

        {/* Message */}
        <p className="text-slate-300 mb-6 leading-relaxed">
          {message}
        </p>

        {/* Estimated Time */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-slate-400 mb-1">Estimated downtime</p>
          <p className="text-lg font-semibold text-white">{estimatedTime}</p>
        </div>

        {/* Loading Animation */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>

        {/* Contact Info */}
        {showContact && (
          <div className="text-sm text-slate-400">
            <p>Need immediate assistance?</p>
            <p className="mt-1">
              Contact us at{' '}
              <a href="mailto:support@ninedartnation.com" className="text-purple-400 hover:text-purple-300 underline">
                support@ninedartnation.com
              </a>
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-700/50">
          <p className="text-xs text-slate-500">
            © 2024 Nine Dart Nation. We'll be back soon{dots}
          </p>
        </div>
      </div>
    </div>
  );
}
