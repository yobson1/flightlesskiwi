class LRUCache<K, V> {
	private maxSize: number;
	private cache: Map<K, V>;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
		this.cache = new Map();
	}

	get(key: K): V | undefined {
		if (!this.cache.has(key)) {
			return undefined;
		}

		// move to end (most recently used)
		const value = this.cache.get(key)!;
		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		// delete if exists to re-insert at end
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		this.cache.set(key, value);

		// evict oldest entry if over capacity
		if (this.cache.size > this.maxSize) {
			// not nullable, firstKey is guaranteed to exist when size > 0
			const firstKey = this.cache.keys().next().value!;
			this.cache.delete(firstKey);
		}
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	evict(key: K): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}
}

export default LRUCache;
