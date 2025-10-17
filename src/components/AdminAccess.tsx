import { useEffect, useState } from 'react';
import { useToast } from '../store/toast';

export default function AdminAccess({ user }: { user?: any }) {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const q = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
        const res = await fetch('/api/subscription' + q);
        if (!res.ok) throw new Error('Failed to fetch subscription');
        const data = await res.json();
        setSubscription(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [user?.email]);

  if (loading) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p>Loading subscription...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2 className="text-2xl font-bold text-red-300 mb-2">Subscription Error</h2>
        <p className="mb-4 text-red-200">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn bg-red-600 hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAccess = subscription?.fullAccess;

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-indigo-300 mb-2">
        {hasAccess ? 'PREMIUM Active' : 'Admin PREMIUM'}
      </h2>
      
      {hasAccess ? (
        <div className="mb-4">
          <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-green-300 font-semibold mb-2">
              ✅ PREMIUM Access Active
            </div>
            <p className="text-green-200 text-sm">
              You have full access to all premium features!
            </p>
            {subscription?.source && (
              <p className="text-green-200 text-xs mt-1">
                Source: {subscription.source}
                {subscription?.expiresAt && ` (expires: ${new Date(subscription.expiresAt).toLocaleDateString()})`}
              </p>
            )}
          </div>
          
          <h3 className="text-lg font-semibold mb-2 text-indigo-200">Your Benefits:</h3>
        </div>
      ) : (
        <p className="mb-2 text-indigo-200">Unlock every game mode known to darts, advanced stats, and admin tools.</p>
      )}
      
      <ul className="mb-4">
        <li>All game modes (including paid/advanced)</li>
        <li>Online play with all rules and variations</li>
        <li>Advanced analytics and leaderboards</li>
        <li>Admin tools for managing matches and users</li>
      </ul>

      {!hasAccess && (
        <button
          onClick={async () => {
            try {
              const res = await fetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email })
              });
              const data = await res.json();
              if (data.ok && data.url) {
                window.open(data.url, '_blank');
                if (data.development) {
                  useToast()("Opened Stripe test checkout (development mode)", { type: 'info', timeout: 3000 });
                }
              } else if (data.error === 'STRIPE_NOT_CONFIGURED') {
                useToast()("Premium purchases are not available in this development environment. Please visit the production site to upgrade.", { type: 'error', timeout: 4000 });
              } else {
                useToast()("Failed to create checkout session. Please try again.", { type: 'error', timeout: 4000 });
              }
            } catch (err) {
              useToast()("Error creating checkout. Please try again.", { type: 'error', timeout: 4000 });
            }
          }}
          className="btn bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-bold shadow-lg hover:scale-105 transition"
        >
          Subscribe to PREMIUM
        </button>
      )}
    </div>
  );
}