import * as v from 'valibot';

export const benchmarkListingResponseSchema = v.object({
	id: v.string(),
	title: v.string(),
	createdAt: v.string(),
	username: v.string(),
	gameName: v.nullable(v.string()),
	coverImgId: v.nullable(v.string()),
	cpus: v.array(v.string()),
	gpus: v.array(v.string())
});

export const benchmarkSearchResponseSchema = v.array(benchmarkListingResponseSchema);

export const benchmarkPageResponseSchema = v.object({
	benchmarks: benchmarkSearchResponseSchema,
	nextCursor: v.nullable(
		v.object({
			createdAt: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
			id: v.string()
		})
	),
	pagination: v.nullable(
		v.object({
			page: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
			pageSize: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
			totalCount: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
			totalPages: v.pipe(v.number(), v.safeInteger(), v.minValue(1))
		})
	)
});

export const benchmarkAPIErrorSchema = v.object({
	message: v.optional(v.string()),
	error: v.optional(v.string())
});

export type BenchmarkPageResponse = v.InferOutput<typeof benchmarkPageResponseSchema>;
