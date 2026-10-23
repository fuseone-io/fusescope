export function formatPrice(amount: number | undefined): string {
  if (amount === undefined) {
    throw new TypeError("price is undefined");
  }
  return `$${amount.toFixed(2)}`;
}
