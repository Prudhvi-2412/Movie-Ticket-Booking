import React from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

/**
 * Catches render-time crashes so a single broken component shows a recovery
 * screen instead of unmounting the whole app to a blank white page.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console output rather than shipped anywhere: there is no error
    // reporting service wired up, and pretending otherwise would be worse.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-ink-950 grid place-items-center p-6">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-negative-500/10 border border-negative-500/30
                          grid place-items-center mx-auto mb-5">
            <AlertTriangle className="w-6 h-6 text-negative-400" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-ink-50">Something broke on this page</h1>
          <p className="text-sm text-ink-400 mt-2 leading-relaxed">
            This is a bug on our side, not something you did. Reloading usually
            clears it.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-5 text-left text-2xs text-negative-400 bg-ink-900 border border-ink-700
                            rounded-xl p-3.5 overflow-auto max-h-48">
              {this.state.error.stack || String(this.state.error)}
            </pre>
          )}

          <div className="flex items-center justify-center gap-3 mt-7">
            <button onClick={() => window.location.reload()} className="btn-primary btn-md">
              <RotateCw className="w-4 h-4" aria-hidden /> Reload
            </button>
            <a href="/" className="btn-secondary btn-md">
              <Home className="w-4 h-4" aria-hidden /> Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
