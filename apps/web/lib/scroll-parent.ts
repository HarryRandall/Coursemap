/**
 * The element that scrolls a node into view. On desktop the app shell's
 * content panel scrolls rather than the window, so code that follows or
 * drives scrolling must ask for the nearest scrolling ancestor instead of
 * assuming the document. Narrow screens still scroll the document.
 */
export function scrollParent(element: Element | null): HTMLElement {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}
