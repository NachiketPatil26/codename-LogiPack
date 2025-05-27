import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Visualization Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-error-50 text-error-700 rounded-lg">
          <h3 className="font-semibold">Visualization Error</h3>
          <p className="text-sm mt-1">There was a problem rendering the 3D visualization.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
