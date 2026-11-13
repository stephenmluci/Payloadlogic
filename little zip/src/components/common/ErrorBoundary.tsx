'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
          <p className="text-sm text-slate-500 max-w-md">
            An unexpected error occurred in this section of the application. 
            {this.state.error && <span className="block mt-2 font-mono text-xs bg-slate-100 p-2 rounded text-left overflow-auto max-h-32">{this.state.error.message}</span>}
          </p>
          <Button 
            onClick={() => this.setState({ hasError: false, error: null })} 
            variant="outline"
            className="mt-4"
          >
            <RefreshCcw className="mr-2 h-4 w-4" /> Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
