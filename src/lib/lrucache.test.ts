import { describe, it, expect, beforeEach } from 'bun:test';
import LRUCache from '$lib/lrucache';

describe('LRUCache', () => {
	let cache: LRUCache<string, number>;

	beforeEach(() => {
		cache = new LRUCache<string, number>(3);
	});

	describe('basic operations', () => {
		it('should set and get values', () => {
			cache.set('a', 1);
			expect(cache.get('a')).toBe(1);
		});

		it('should return undefined for non-existent keys', () => {
			expect(cache.get('nonexistent')).toBeUndefined();
		});

		it('should return true for existing keys with has()', () => {
			cache.set('a', 1);
			expect(cache.has('a')).toBe(true);
		});

		it('should return false for non-existent keys with has()', () => {
			expect(cache.has('nonexistent')).toBe(false);
		});

		it('should track size correctly', () => {
			expect(cache.size).toBe(0);
			cache.set('a', 1);
			expect(cache.size).toBe(1);
			cache.set('b', 2);
			expect(cache.size).toBe(2);
		});
	});

	describe('eviction behavior', () => {
		it('should evict least recently used item when capacity is exceeded', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			cache.set('d', 4); // Should evict 'a'

			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
			expect(cache.size).toBe(3);
		});

		it('should not exceed max size', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			cache.set('d', 4);
			cache.set('e', 5);

			expect(cache.size).toBe(3);
		});

		it('should evict in correct order (FIFO when no access)', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			cache.set('d', 4); // Evicts 'a'
			cache.set('e', 5); // Evicts 'b'

			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBeUndefined();
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
			expect(cache.get('e')).toBe(5);
		});
	});

	describe('get()', () => {
		it('should move accessed item to end (most recently used)', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);

			// Access 'a' to make it most recently used
			cache.get('a');

			// Add new item, should evict 'b' (least recently used)
			cache.set('d', 4);

			expect(cache.get('a')).toBe(1); // Still exists
			expect(cache.get('b')).toBeUndefined(); // Evicted
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
		});

		it('should handle multiple accesses correctly', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);

			// Access order: b, a, c
			cache.get('b');
			cache.get('a');
			cache.get('c');

			// Add new item, should evict 'b' (accessed first, so oldest)
			cache.set('d', 4);

			expect(cache.get('b')).toBeUndefined();
			expect(cache.get('a')).toBe(1);
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
		});
	});

	describe('LRU behavior with set()', () => {
		it('should move re-set item to end (most recently used)', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);

			// Re-set 'a' with new value
			cache.set('a', 10);

			// Add new item, should evict 'b' (now least recently used)
			cache.set('d', 4);

			expect(cache.get('a')).toBe(10); // Still exists with new value
			expect(cache.get('b')).toBeUndefined(); // Evicted
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
		});

		it('should update value when setting existing key', () => {
			cache.set('a', 1);
			expect(cache.get('a')).toBe(1);

			cache.set('a', 100);
			expect(cache.get('a')).toBe(100);
			expect(cache.size).toBe(1); // Size shouldn't change
		});

		it('should not increase size when updating existing key', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			expect(cache.size).toBe(2);

			cache.set('a', 10);
			expect(cache.size).toBe(2);
		});
	});

	describe('clear()', () => {
		it('should clear all entries', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);

			cache.clear();

			expect(cache.size).toBe(0);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBeUndefined();
			expect(cache.get('c')).toBeUndefined();
		});

		it('should allow adding items after clear', () => {
			cache.set('a', 1);
			cache.clear();
			cache.set('b', 2);

			expect(cache.size).toBe(1);
			expect(cache.get('b')).toBe(2);
		});
	});

	describe('evict()', () => {
		it('should manually evict a specific key', () => {
			cache.set('a', 1);
			cache.set('b', 2);

			const result = cache.evict('a');

			expect(result).toBe(true);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe(2);
			expect(cache.size).toBe(1);
		});

		it('should return false when evicting non-existent key', () => {
			cache.set('a', 1);

			const result = cache.evict('nonexistent');

			expect(result).toBe(false);
			expect(cache.size).toBe(1);
		});

		it('should not affect size when evicting non-existent key', () => {
			cache.set('a', 1);
			cache.set('b', 2);

			cache.evict('nonexistent');

			expect(cache.size).toBe(2);
		});

		it('should allow evicting then re-adding same key', () => {
			cache.set('a', 1);
			cache.evict('a');
			cache.set('a', 2);

			expect(cache.get('a')).toBe(2);
			expect(cache.size).toBe(1);
		});

		it('should work with has() after eviction', () => {
			cache.set('a', 1);
			expect(cache.has('a')).toBe(true);

			cache.evict('a');
			expect(cache.has('a')).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle cache size of 1', () => {
			const smallCache = new LRUCache<string, number>(1);
			smallCache.set('a', 1);
			expect(smallCache.get('a')).toBe(1);

			smallCache.set('b', 2);
			expect(smallCache.get('a')).toBeUndefined();
			expect(smallCache.get('b')).toBe(2);
			expect(smallCache.size).toBe(1);
		});

		it('should handle large cache size', () => {
			const largeCache = new LRUCache<number, string>(1000);

			for (let i = 0; i < 1000; i++) {
				largeCache.set(i, `value${i}`);
			}

			expect(largeCache.size).toBe(1000);

			// Add one more to trigger eviction
			largeCache.set(1000, 'value1000');
			expect(largeCache.size).toBe(1000);
			expect(largeCache.get(0)).toBeUndefined(); // First item evicted
			expect(largeCache.get(1000)).toBe('value1000');
		});

		it('should work with different types', () => {
			const objCache = new LRUCache<string, { value: number }>(2);
			objCache.set('a', { value: 1 });
			objCache.set('b', { value: 2 });

			expect(objCache.get('a')).toEqual({ value: 1 });
			expect(objCache.get('b')).toEqual({ value: 2 });
		});

		it('should handle setting same key multiple times before eviction', () => {
			cache.set('a', 1);
			cache.set('a', 2);
			cache.set('a', 3);
			cache.set('b', 4);
			cache.set('c', 5);

			expect(cache.get('a')).toBe(3);
			expect(cache.size).toBe(3);
		});
	});

	describe('complex eviction scenarios', () => {
		it('should handle interleaved gets and sets', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);

			cache.get('a'); // Move 'a' to end
			cache.set('b', 20); // Move 'b' to end
			cache.set('d', 4); // Should evict 'c'

			expect(cache.get('c')).toBeUndefined();
			expect(cache.get('a')).toBe(1);
			expect(cache.get('b')).toBe(20);
			expect(cache.get('d')).toBe(4);
		});

		it('should maintain correct order after multiple operations', () => {
			cache.set('a', 1);
			cache.set('b', 2);
			cache.get('a'); // a moves to end: b, a
			cache.set('c', 3); // b, a, c
			cache.get('b'); // b moves to end: a, c, b
			cache.set('d', 4); // Should evict 'a': c, b, d

			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
		});
	});
});
