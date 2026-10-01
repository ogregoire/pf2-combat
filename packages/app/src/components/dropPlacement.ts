/** Which side of a drop target the pointer was released on. The top half
 * means "put it before this row", the bottom half "after" — without the
 * split, a row could only ever be dropped *before* another, so dragging
 * the upper of two tied PCs onto the lower one was a no-op and the pair
 * could never be swapped. jsdom reports an all-zero rect, where `<=` makes
 * the default "before". */
export function dropPlacement(e: React.DragEvent, target: HTMLElement): "before" | "after" {
  const rect = target.getBoundingClientRect();
  return e.clientY <= rect.top + rect.height / 2 ? "before" : "after";
}

