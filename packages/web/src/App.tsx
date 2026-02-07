import { AppProvider, useApp } from './context/AppContext.js';
import IdentityView from './components/IdentityView.js';
import ConversationsView from './components/ConversationsView.js';

function AppContent() {
  const { identity, error, clearError } = useApp();

  return (
    <>
      {error && (
        <div className="toast toast-error" onClick={clearError}>
          {error}
        </div>
      )}

      {!identity ? <IdentityView /> : <ConversationsView />}
    </>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
