/**
 * Tiny class-name joiner. Filters falsy values without a runtime dep.
 */
export function cn(
  ...inputs: Array<string | number | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(' ')
}
