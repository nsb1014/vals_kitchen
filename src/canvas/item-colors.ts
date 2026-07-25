const EQUIPMENT_COLORS: Record<string, number> = {
  prep_station: 0x708090,
  grill: 0xb55239,
  oven: 0xc4784a,
  fryer: 0xd4a017,
  stockpot: 0x5f7a8a,
  cold_station: 0x6ca6cd,
  pastry_bench: 0xc4a882,
  smoker: 0x4a4a4a,
  wok: 0x8b4513,
  fermentation_crock: 0x7a8b6f,
  barista_station: 0x6f4e37,
  spice_rack: 0xa0522d,
};

const TABLE_COLOR = 0x8b5a2b;
const DECOR_COLOR = 0x4a7c59;
const DEFAULT_COLOR = 0x666688;

export function colorForItemKey(itemKey: string): number {
  if (itemKey.startsWith('table')) return TABLE_COLOR;
  if (itemKey.startsWith('decor')) return DECOR_COLOR;
  return EQUIPMENT_COLORS[itemKey] ?? DEFAULT_COLOR;
}
