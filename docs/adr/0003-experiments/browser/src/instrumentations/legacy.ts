export interface PropagationOptions {
  /** Cross-origin URLs that receive `traceparent`; same-origin always does. */
  propagateTo?: (string | RegExp)[];
}
