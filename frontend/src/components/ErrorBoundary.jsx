import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    this.setState({ message: error?.message || 'Unexpected UI error' });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center px-4">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/30 rounded-2xl p-6 shadow-xl">
            <div className="flex items-start gap-3 text-red-700 dark:text-red-300">
              <span className="material-symbols-outlined">error</span>
              <div>
                <h2 className="text-lg font-bold">Something went wrong</h2>
                <p className="text-sm mt-1">
                  {this.state.message || 'An unexpected error occurred while rendering this page.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 w-full px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
