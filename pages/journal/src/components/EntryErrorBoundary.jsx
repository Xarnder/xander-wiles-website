import React from 'react';
import { PenTool } from 'lucide-react';

export default class EntryErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('The journal entry screen failed to render:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div role="alert" className="glass-card p-8 flex min-h-[320px] flex-col items-center justify-center text-center">
                <PenTool className="mb-4 h-10 w-10 text-primary" />
                <h2 className="mb-2 font-serif text-xl font-bold text-text">The editor needs to restart</h2>
                <p className="mb-5 text-text-secondary">
                    Your saved journal entry is safe. Restart the editor or return to the calendar.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    <button type="button" onClick={this.handleRetry} className="glass-button px-4 py-2 text-text">
                        Restart editor
                    </button>
                    <a href="/pages/journal/" className="glass-button px-4 py-2 text-text">
                        Back to calendar
                    </a>
                </div>
            </div>
        );
    }
}
