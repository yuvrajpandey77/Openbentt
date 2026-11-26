import * as React from "react"

import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[2.5rem] w-full rounded-xl bg-background px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 selection:bg-primary/45 selection:text-foreground",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
