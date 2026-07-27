/**
 * Shared test helpers.
 *
 * <Shield> is a plain function component with no hooks, so tests call it
 * directly and inspect the React element tree it returns. That needs no
 * react-dom, no DOM environment, and no renderer — and it is the same tree
 * React would serialise, so assertions about DOM order and nesting hold.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";

/** Untyped prop access, for reading `aria-hidden` / `data-typeface` / etc. */
export function props(el: ReactElement): Record<string, unknown> {
  return el.props as Record<string, unknown>;
}

/** Every element in the tree, in pre-order — i.e. in DOM order. */
export function walkAll(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) walkAll(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  out.push(node);
  walkAll(props(node).children as ReactNode, out);
  return out;
}

/** Elements strictly inside `el`. */
export function descendants(el: ReactElement): ReactElement[] {
  return walkAll(props(el).children as ReactNode);
}

/** The encoded block: the one element carrying `aria-hidden="true"`. */
export function shieldedBlock(tree: ReactNode): ReactElement {
  const el = walkAll(tree).find((e) => props(e)["aria-hidden"] === "true");
  if (!el) throw new Error("no aria-hidden block in the rendered tree");
  return el;
}

/** The variant <Shield> actually chose, read off the rendered data attribute. */
export function renderedVariant(tree: ReactNode): string {
  return props(shieldedBlock(tree))["data-typeface"] as string;
}

/** First element of a given tag name. */
export function findTag(tree: ReactNode, tag: string): ReactElement | undefined {
  return walkAll(tree).find((e) => e.type === tag);
}

/** All elements of a given tag name. */
export function findAllTags(tree: ReactNode, tag: string): ReactElement[] {
  return walkAll(tree).filter((e) => e.type === tag);
}
