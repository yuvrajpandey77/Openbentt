import React, { useState } from "react";
import { Bug, ExternalLink, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SUPPORT_EMAIL,
  buildFeedbackMailto,
  collectFeedbackDiagnostics,
  openFeedbackContact,
} from "@/lib/feedback";

/**
 * Bug/feedback loop: describes the issue, auto-attaches safe diagnostics,
 * sends via email (support@cogerphere.com) or the contact page.
 * Mounted in the app header + sidebar + settings; also linked from the
 * error boundary fallback.
 */
export const FeedbackDialog: React.FC<{
  triggerClassName?: string;
  context?: string;
  compact?: boolean;
}> = ({ triggerClassName, context, compact }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const diagnostics = collectFeedbackDiagnostics(context);

  const sendEmail = () => {
    const text = message.trim() || "(no description given)";
    window.location.href = buildFeedbackMailto(text, diagnostics);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button type="button" variant="ghost" size="icon" className={triggerClassName ?? "h-8 w-8"} aria-label="Report a bug">
            <Bug size={16} />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className={triggerClassName ?? "h-8 gap-1.5 text-xs"}>
            <Bug size={14} />
            Report bug
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug size={16} className="text-primary" />
            Report a bug
          </DialogTitle>
          <DialogDescription>
            Describe what broke. App version and platform are attached automatically — never your chats or keys.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened? What did you expect?"
          className="min-h-24 text-sm"
          aria-label="Bug description"
        />
        <details className="rounded-md border border-border/60 bg-muted/20 p-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">Attached diagnostics</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">{diagnostics}</pre>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="gap-1.5" onClick={sendEmail}>
            <Mail size={14} />
            Email {SUPPORT_EMAIL}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              openFeedbackContact();
              setOpen(false);
            }}
          >
            <ExternalLink size={14} />
            Contact page
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
