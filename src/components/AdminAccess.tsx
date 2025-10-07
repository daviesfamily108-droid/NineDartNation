export default function AdminAccess() {
  return (
    <div className="card">
  <h2 className="text-2xl font-bold text-indigo-300 mb-2">Admin PREMIUM</h2>
  <p className="mb-2 text-indigo-200">Unlock every game mode known to darts, advanced stats, and admin tools.</p>
      <ul className="mb-4">
        <li>All game modes (including paid/advanced)</li>
        <li>Online play with all rules and variations</li>
        <li>Advanced analytics and leaderboards</li>
        <li>Admin tools for managing matches and users</li>
      </ul>
  <a href="https://buy.stripe.com/test_00g7vQ8Qw2gQ0wA5kk" target="_blank" rel="noopener noreferrer" className="btn bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-bold shadow-lg hover:scale-105 transition">Subscribe to PREMIUM</a>
    </div>
  );
}