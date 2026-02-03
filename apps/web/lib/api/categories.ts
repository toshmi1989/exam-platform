import { API_BASE_URL } from './config';

export async function getCategories() {
  const res = await fetch(`${API_BASE_URL}/categories`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to fetch categories');
  }

  return res.json();
}
