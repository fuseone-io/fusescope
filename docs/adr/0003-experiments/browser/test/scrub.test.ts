import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultRoute } from '../src/route.ts';
import { scrubAttributes, scrubUrl } from '../src/scrub.ts';

test('scrubUrl drops query and fragment by default', () => {
  const cases: [string, string[], string][] = [
    ['https://shop.example/cart?email=a@b.c&token=x#pay', [], 'https://shop.example/cart'],
    ['https://shop.example/search?q=shoes&utm_source=ad', ['utm_source'], 'https://shop.example/search?utm_source=ad'],
    ['/api/orders?id=7#x', [], '/api/orders'],
    ['http://[bad?secret=1', [], 'http://[bad'],
  ];
  for (const [input, allowed, want] of cases) assert.equal(scrubUrl(input, allowed, 'https://shop.example'), want, input);
});

test('scrubAttributes rewrites only URL attributes', () => {
  const out = scrubAttributes({ 'url.full': 'https://a.example/x?k=v', 'url.query': 'k=v&keep=1', 'http.method': 'GET' }, ['keep']);
  assert.deepEqual(out, { 'url.full': 'https://a.example/x', 'url.query': 'keep=1' });
});

test('defaultRoute templates id segments', () => {
  assert.equal(defaultRoute('/orders/123/items/9f86d081-884c-4d63-8f2b-1d1e7c3f6a10'), '/orders/:id/items/:id');
  assert.equal(defaultRoute('/settings/profile'), '/settings/profile');
});
