export type Finish = { id: string; name: string; color: string; demo?: boolean };
export type Product = {
  id: string; slug: string; name: string; price: number;
  department: 'home' | 'clothing'; sizes?: string[];
  category: string; categories: string[]; isNew: boolean;
  description: string; supporting: string; details: string;
  image: string; relatedImage: string; gallery: { image: string; label: string }[];
  finishes: Finish[];
};

export const homeProducts: Product[] = [
  {
    id: 'halo', slug: 'halo-pendant-light', name: 'Halo Pendant Light', price: 32500,
    department: 'home', category: 'Lighting', categories: ['lighting'], isNew: true,
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
    department: 'home', category: 'Lighting', categories: ['lighting'], isNew: false,
    description: 'A rounded ceramic base paired with a softly textured fabric shade.',
    supporting: 'A quiet pool of light, wherever you settle.',
    details: 'Warm ceramic and an ivory fabric shade bring a gentle balance of shape and texture to a side table or bedside.',
    image: 'arc-table-lamp', relatedImage: 'arc-related',
    gallery: [{ image: 'arc-table-lamp', label: 'Ceramic table lamp' }],
    finishes: [{ id: 'oatmeal', name: 'Oatmeal', color: '#D8C8B2' }, { id: 'sage', name: 'Sage', color: '#9DA28D', demo: true }]
  },
  {
    id: 'travertine', slug: 'travertine-coffee-table', name: 'Travertine Coffee Table', price: 89500,
    department: 'home', category: 'Tables', categories: ['tables', 'furniture'], isNew: false,
    description: 'A generous rounded travertine top on a sculptural pedestal base.',
    supporting: 'Natural texture at the heart of your living space.',
    details: 'A low, rounded stone table with a substantial cylindrical base. The reference shows the natural tonal variation of travertine.',
    image: 'travertine-coffee-table', relatedImage: 'table-related',
    gallery: [{ image: 'travertine-coffee-table', label: 'Travertine table' }],
    finishes: [{ id: 'natural', name: 'Natural', color: '#BDA281' }]
  },
  {
    id: 'vase', slug: 'sculptural-ceramic-vase', name: 'Sculptural Ceramic Vase', price: 8500,
    department: 'home', category: 'Homeware', categories: ['homeware'], isNew: true,
    description: 'An organic ceramic vessel with a softly textured, chalky finish.',
    supporting: 'Beautiful with a branch, or simply on its own.',
    details: 'A softly sculpted silhouette and tactile ceramic surface. A considered finishing touch for a shelf, console or table.',
    image: 'sculptural-ceramic-vase', relatedImage: 'vase-related',
    gallery: [{ image: 'sculptural-ceramic-vase', label: 'Sculptural ceramic vase' }, { image: 'category-homeware', label: 'Ceramics styled at home' }],
    finishes: [{ id: 'chalk', name: 'Chalk', color: '#D5C7B2' }, { id: 'stone', name: 'Stone', color: '#7F7057', demo: true }]
  }
];

export const clothingCategories = ['Womenswear', 'Menswear', 'Accessories'];
const womensSizes = ['UK 6', 'UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16'];
const mensSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const clothing = (id: string, slug: string, name: string, price: number, category: string, image: string, colour: string, hex: string, sizes: string[], description: string, details: string, isNew = false): Product => ({
  id, slug, name, price, department: 'clothing', category, categories: [category.toLowerCase(), 'clothing'], isNew,
  image, relatedImage: image, gallery: [{ image, label: `${name} in ${colour}` }],
  finishes: [{ id: colour.toLowerCase().replaceAll(' ', '-'), name: colour, color: hex }], sizes,
  description, supporting: 'An effortless addition to a considered wardrobe.', details
});
export const clothingProducts: Product[] = [
  clothing('coat', 'the-tailored-coat', 'The Tailored Coat', 29500, 'Womenswear', 'fashion-coat', 'Camel', '#B18D69', womensSizes,
    'A long, softly structured coat in a warm camel tone.', 'Clean lapels, a generous silhouette and an understated finish. Layer over fine knits and relaxed tailoring.', true),
  clothing('knit', 'the-textured-knit', 'The Textured Knit', 8900, 'Womenswear', 'fashion-knit', 'Ivory', '#E7DFD0', ['XS', 'S', 'M', 'L', 'XL'],
    'An ivory crewneck with beautiful texture and an easy shape.', 'A softly textured knit with a simple neckline and relaxed proportions. An everyday layer, worn on its own or under a coat.'),
  clothing('dress', 'the-fluid-midi-dress', 'The Fluid Midi Dress', 14500, 'Womenswear', 'fashion-dress', 'Black', '#242320', womensSizes,
    'A fluid, sleeveless midi dress in timeless black.', 'A flowing silhouette and pared-back neckline. Style simply for evenings, or layer with a knit for quieter moments.', true),
  clothing('overshirt', 'the-relaxed-overshirt', 'The Relaxed Overshirt', 12500, 'Menswear', 'fashion-overshirt', 'Dark olive', '#46483D', mensSizes,
    'A dark olive overshirt with a relaxed, versatile shape.', 'An easy outer layer with understated detailing. Pair with stone trousers and an ivory shirt.'),
  clothing('trousers', 'the-tailored-trousers', 'The Tailored Trousers', 9500, 'Menswear', 'fashion-trousers', 'Stone', '#C5B9A4', ['28', '30', '32', '34', '36', '38'],
    'Stone-coloured trousers with a clean, tailored line.', 'A quietly refined shape for everyday dressing. A neutral foundation for shirts, knitwear and soft layers.'),
  clothing('shirt', 'the-everyday-shirt', 'The Everyday Shirt', 7900, 'Menswear', 'fashion-shirt', 'Ivory', '#E7DFD0', mensSizes,
    'An ivory shirt with an easy fit and a softly considered finish.', 'A relaxed take on a wardrobe essential. Wear open over a simple layer or buttoned with tailored trousers.'),
  clothing('bag', 'the-sculpted-shoulder-bag', 'The Sculpted Shoulder Bag', 16500, 'Accessories', 'fashion-bag', 'Chocolate', '#493329', ['One size'],
    'A sculptural shoulder bag in a deep chocolate tone.', 'A curved silhouette and minimal detailing make this a considered finishing touch to everyday outfits.', true),
  clothing('scarf', 'the-soft-fringed-scarf', 'The Soft Fringed Scarf', 4900, 'Accessories', 'fashion-scarf', 'Sage', '#A6B49F', ['One size'],
    'A softly draped scarf in ALDESCA’s signature sage.', 'Generous proportions with a fringed edge. Drape over a coat or fold neatly around the neckline.')
];
export const products: Product[] = [...homeProducts, ...clothingProducts];

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (pence: number) => currency.format(pence / 100);
export const productById = (id: string) => products.find((product) => product.id === id);
export const categories = ['Lighting', 'Tables', 'Furniture', 'Homeware'];
export function filterProducts(category = '', query = '', department?: Product['department']) {
  const search = query.toLowerCase().trim();
  return products.filter((p) =>
    (!department || p.department === department) &&
    (!category || (category === 'new-in' ? p.isNew : p.categories.includes(category.toLowerCase()))) &&
    (!search || `${p.name} ${p.categories.join(' ')}`.toLowerCase().includes(search))
  );
}
