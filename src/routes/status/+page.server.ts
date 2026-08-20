import { getIgdbImportStatus } from '#lib/server/igdb-sync.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ depends, setHeaders }) => {
	depends('igdb:imports');
	setHeaders({ 'cache-control': 'no-store' });

	return {
		importStatus: getIgdbImportStatus()
	};
};
