'use client'

import { Component, ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center space-y-2">
          <p className="text-red-700 font-medium">Une erreur est survenue dans cette section.</p>
          {this.state.error?.message && (
            <p className="text-red-600 text-sm">{this.state.error.message}</p>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Réessayer
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
