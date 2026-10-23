import { formatPrice } from "./price";

interface Cart {
  items: { price?: number }[];
}

export function renderCart(cart: Cart): string[] {
  return cart.items.map((item) => formatPrice(item.price));
}

renderCart({ items: [{ price: 3 }, {}] });
