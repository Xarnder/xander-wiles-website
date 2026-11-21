import { getContext, setContext } from 'svelte';
import { productById } from './catalogue';

export type CartLine = { productId: string; finishId: string; quantity: number };
export type Panel = 'cart' | 'wishlist' | 'search' | 'account' | 'menu' | 'about' | 'contact' | 'delivery' | null;
const STORE_KEY = Symbol('aldesca-store');
const STORAGE_KEY = 'aldesca:store:v1';
export const validQuantity = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 999;

export class ShopState {
  cart = $state<CartLine[]>([]);
  wishlist = $state<string[]>([]);
  panel = $state<Panel>(null);
  query = $state('');
  announcement = $state('');
  restored = $state(false);
  unitCount = $derived(this.cart.reduce((sum, line) => sum + line.quantity, 0));
  subtotal = $derived(this.cart.reduce((sum, line) => sum + (productById(line.productId)?.price ?? 0) * line.quantity, 0));

  restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.version === 1) {
        const lines: CartLine[] = [];
        if (Array.isArray(saved.cart)) for (const line of saved.cart) {
          if (!line || !validQuantity(line.quantity)) continue;
          const product = productById(line.productId);
          if (!product?.finishes.some((f) => f.id === line.finishId)) continue;
          const existing = lines.find((entry) => entry.productId === line.productId && entry.finishId === line.finishId);
          if (existing) existing.quantity = Math.min(999, existing.quantity + line.quantity);
          else lines.push({ productId: line.productId, finishId: line.finishId, quantity: line.quantity });
        }
        this.cart = lines;
        this.wishlist = Array.isArray(saved.wishlist) ? [...new Set<string>(saved.wishlist.filter((id: unknown) => typeof id === 'string' && productById(id)))] : [];
      }
    } catch { /* Storage may be blocked or corrupted; the in-memory shop still works. */ }
    this.restored = true;
  }
  persist() {
    if (!this.restored) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cart: this.cart, wishlist: this.wishlist })); }
    catch { /* Browsing remains available without persistent storage. */ }
  }
  add(productId: string, finishId: string, quantity: number) {
    const product = productById(productId);
    if (!product || !product.finishes.some((f) => f.id === finishId) || !validQuantity(quantity)) return;
    const existing = this.cart.find((line) => line.productId === productId && line.finishId === finishId);
    if (existing) existing.quantity = Math.min(999, existing.quantity + quantity);
    else this.cart.push({ productId, finishId, quantity });
    this.announcement = `${quantity} ${product.name}${quantity > 1 ? 's' : ''} added to your bag.`;
    this.panel = 'cart';
    this.persist();
  }
  quantity(productId: string, finishId: string, quantity: number) {
    if (!validQuantity(quantity)) return;
    const line = this.cart.find((l) => l.productId === productId && l.finishId === finishId);
    if (line) line.quantity = quantity;
    this.announcement = 'Bag quantity updated.';
    this.persist();
  }
  remove(productId: string, finishId: string) {
    this.cart = this.cart.filter((l) => l.productId !== productId || l.finishId !== finishId);
    this.announcement = 'Item removed from your bag.';
    this.persist();
  }
  toggleWishlist(id: string) {
    if (!productById(id)) return;
    const saved = this.wishlist.includes(id);
    this.wishlist = saved ? this.wishlist.filter((value) => value !== id) : [...this.wishlist, id];
    this.announcement = `${productById(id)?.name} ${saved ? 'removed from' : 'saved to'} your wishlist.`;
    this.persist();
  }
}
export const createShop = () => setContext(STORE_KEY, new ShopState());
export const useShop = () => getContext<ShopState>(STORE_KEY);
