import { useEffect, useRef, type RefObject } from "react";

export function useDialogFocus(open: boolean, container: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const blocked: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
    let branch = container.current;
    while (branch?.parentElement && branch !== document.body) {
      const parent = branch.parentElement;
      Array.from(parent.children).forEach((sibling) => {
        if (!(sibling instanceof HTMLElement) || sibling === branch) return;
        blocked.push({ element: sibling, inert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden") });
        sibling.setAttribute("aria-hidden", "true");
        if (!sibling.hasAttribute("data-dialog-dismiss")) sibling.inert = true;
      });
      branch = parent;
    }
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const focusFirst = () => {
      const target = container.current?.querySelector<HTMLElement>("[autofocus]") || container.current?.querySelector<HTMLElement>(focusableSelector);
      target?.focus();
    };
    const frame = requestAnimationFrame(focusFirst);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !container.current) return;
      const focusable = Array.from(container.current.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hidden && element.offsetParent !== null);
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!container.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      blocked.reverse().forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      previous?.focus();
    };
  }, [open, container]);
}
