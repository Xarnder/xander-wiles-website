export type Finish = { id: string; name: string; color: string; demo?: boolean };
export type Product = {
  id: string; slug: string; name: string; price: number;
  category: string; categories: string[]; isNew: boolean;
  description: string; supporting: string; details: string;
  image: string; relatedImage: string; gallery: { image: string; label: string }[];
  finishes: Finish[];
};

export const products: Product[] = [
  {
    id: 'halo', slug: 'halo-pendant-light', name: 'Halo Pendant Light', price: 32500,
    category: 'Lighting', categories: ['lighting'], isNew: true,
    description: 'A sculptural opal-glass pendant with a refined dark fitting.',
    supporting: 'A soft, inviting glow for everyday living.',
    details: 'A broad, softly rounded opal-glass shade, a dark cylindrical fitting and a slender suspension cable. A sculptural focal point for a considered space.',
    image: 'halo-card', relatedImage: 'halo-card',
    gallery: [
      { image: 'halo-main', label: 'Front product view' },
      { image: 'halo-interior', label: 'In a considered interior' },
      { image: 'halo-fitting-detail', label: 'Dark fitting detail' },
      { image: 'halo-glass-detail', label: 'Curved opal glass detail' }
    ],
    finishes: [{ id: 'dark', name: 'Dark', color: '#403329' }, { id: 'light-neutral', name: 'Light neutral', color: '#D8C8B2', demo: true }]
  },
  {
    id: 'arc', slug: 'arc-table-lamp', name: 'Arc Table Lamp', price: 24500,
    category: 'Lighting', categories: ['lighting'], isNew: false,
    description: 'A rounded ceramic base paired with a softly textured fabric shade.',
    supporting: 'A quiet pool of light, wherever you settle.',
    details: 'Warm ceramic and an ivory fabric shade bring a gentle balance of shape and texture to a side table or bedside.',
    image: 'arc-table-lamp', relatedImage: 'arc-related',
    gallery: [{ image: 'arc-table-lamp', label: 'Ceramic table lamp' }],
    finishes: [{ id: 'oatmeal', name: 'Oatmeal', color: '#D8C8B2' }, { id: 'sage', name: 'Sage', color: '#9DA28D', demo: true }]
  },
  {
    id: 'travertine', slug: 'travertine-coffee-table', name: 'Travertine Coffee Table', price: 89500,
    category: 'Tables', categories: ['tables', 'furniture'], isNew: false,
    description: 'A generous rounded travertine top on a sculptural pedestal base.',
    supporting: 'Natural texture at the heart of your living space.',
    details: 'A low, rounded stone table with a substantial cylindrical base. The reference shows the natural tonal variation of travertine.',
    image: 'travertine-coffee-table', relatedImage: 'table-related',
    gallery: [{ image: 'travertine-coffee-table', label: 'Travertine table' }],
    finishes: [{ id: 'natural', name: 'Natural', color: '#BDA281' }]
  },
  {
    id: 'vase', slug: 'sculptural-ceramic-vase', name: 'Sculptural Ceramic Vase', price: 8500,
    category: 'Homeware', categories: ['homeware'], isNew: true,
    description: 'An organic ceramic vessel with a softly textured, chalky finish.',
    supporting: 'Beautiful with a branch, or simply on its own.',
    details: 'A softly sculpted silhouette and tactile ceramic surface. A considered finishing touch for a shelf, console or table.',
    image: 'sculptural-ceramic-vase', relatedImage: 'vase-related',
    gallery: [{ image: 'sculptural-ceramic-vase', label: 'Sculptural ceramic vase' }, { image: 'category-homeware', label: 'Ceramics styled at home' }],
    finishes: [{ id: 'chalk', name: 'Chalk', color: '#D5C7B2' }, { id: 'stone', name: 'Stone', color: '#7F7057', demo: true }]
  }
];

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (pence: number) => currency.format(pence / 100);
export const productById = (id: string) => products.find((product) => product.id === id);
export const categories = ['Lighting', 'Tables', 'Furniture', 'Homeware'];
export function filterProducts(category = '', query = '') {
  const search = query.toLowerCase().trim();
  return products.filter((p) =>
    (!category || (category === 'new-in' ? p.isNew : p.categories.includes(category.toLowerCase()))) &&
    (!search || `${p.name} ${p.categories.join(' ')}`.toLowerCase().includes(search))
  );
}
