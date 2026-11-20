import { Utensils, Pizza, Salad, Soup, Sandwich, Fish, Beef, Drumstick, Egg, Cake, IceCream, Cookie, Coffee, CupSoda, Wine, Beer, GlassWater, Martini, Baby, Leaf, Flame, Star, Gift, Package, type LucideIcon } from 'lucide-react';
import { mediaUrl } from '@/api/client';

/** Built-in outline icons a group/item can use when it has no photo. Keys must match the backend list. */
export const MENU_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, pizza: Pizza, salad: Salad, soup: Soup, sandwich: Sandwich, fish: Fish, beef: Beef, drumstick: Drumstick, egg: Egg,
  cake: Cake, 'ice-cream': IceCream, cookie: Cookie, coffee: Coffee, 'cup-soda': CupSoda, wine: Wine, beer: Beer, 'glass-water': GlassWater,
  martini: Martini, baby: Baby, leaf: Leaf, flame: Flame, star: Star, gift: Gift, package: Package,
};

/** Photo if there is one, otherwise the chosen outline icon, otherwise nothing. */
export default function MenuThumb({ imageUrl, icon, className = 'w-10 h-10', iconClass = 'w-5 h-5' }:
  { imageUrl?: string | null; icon?: string | null; className?: string; iconClass?: string }) {
  if (imageUrl) return <img src={mediaUrl(imageUrl)} alt="" loading="lazy" draggable={false} className={`${className} object-cover rounded-lg flex-shrink-0`} />;
  const Ic = icon ? MENU_ICONS[icon] : null;
  if (!Ic) return null;
  return <span className={`${className} rounded-lg flex-shrink-0 flex items-center justify-center bg-black/5 dark:bg-white/10`}><Ic className={iconClass} strokeWidth={1.75} aria-hidden="true" /></span>;
}
