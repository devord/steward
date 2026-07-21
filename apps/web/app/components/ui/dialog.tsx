import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // Plain scrim, no backdrop blur: the board should stay legible
        // behind panels (terminal-calm, not glass).
        "fixed inset-0 isolate z-50 bg-bg/70 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // The popup is fixed-positioned, so the body's safe-area padding
          // doesn't reach it: subtract the insets from the mobile width cap.
          // `grid-cols-[minmax(0,1fr)]` caps the single content column at the
          // popup width so wide/unbreakable children (long mono repo names,
          // full-width inputs) truncate instead of forcing grid tracks past
          // the max-width cap; `overflow-x-clip` is the belt-and-suspenders
          // that keeps any residual spill from widening the page and pushing
          // the centered dialog off-screen on mobile (clip, not hidden, so it
          // never turns the popup into a vertical scroll container).
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%_-_2rem_-_env(safe-area-inset-left)_-_env(safe-area-inset-right))] -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)] gap-4 overflow-x-clip rounded-xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      // One row that wraps, at every width — not a stacked-then-row fork.
      // Stretching to full width was the vendored default; below `sm` it gave
      // a 13:1 accent slab for a two-word verb, and a ghost dismiss with no
      // boundary at all — a text label whose hover wash then spanned the whole
      // footer, the same "full-height slab" DESIGN.md rejects for header
      // actions. Buttons keep their content width here and wrap onto their own
      // line only when they genuinely don't fit (three actions, a long pt-BR
      // label, a 320px phone), which is what the stacking was really buying.
      className={cn(
        "-mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-muted/50 px-4 py-3",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
