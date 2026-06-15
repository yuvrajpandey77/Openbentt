import React from "react";
import { ImageOff } from "lucide-react";

type Props = {
  children: React.ReactNode;
  attachmentName?: string;
  onRemove?: () => void;
};

type State = { error: Error | null };

/** Catches render errors in attachment previews (bad data URLs, etc.). */
export class AttachmentPreviewErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.warn("[Openbentt] attachment preview error", error, info);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-destructive/30 bg-destructive/5 p-1 text-center">
          <ImageOff className="h-4 w-4 text-destructive/80" aria-hidden />
          <span className="text-[9px] leading-tight text-destructive/90">Preview failed</span>
          {this.props.onRemove && (
            <button
              type="button"
              className="text-[9px] text-muted-foreground underline"
              onClick={this.props.onRemove}
            >
              Remove
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
