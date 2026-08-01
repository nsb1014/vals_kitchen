export const OPEN_RESTAURANT_SHOP_EVENT = 'open-restaurant-shop';

/** One-shot UI command; no shop-open state is persisted or replayed. */
export function requestRestaurantShopOpen(target: Window = window): void {
  target.dispatchEvent(new Event(OPEN_RESTAURANT_SHOP_EVENT));
}
