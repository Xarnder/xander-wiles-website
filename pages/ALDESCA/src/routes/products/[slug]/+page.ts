import { error } from '@sveltejs/kit';
import { products } from '#lib/catalogue.ts';

export function entries() { return products.map(product => ({ slug: product.slug })); }
export function load({ params }: { params: { slug: string } }) {
  const product = products.find(item => item.slug === params.slug);
  if (!product) error(404, { message: 'This piece could not be found.' });
  return { product };
}
