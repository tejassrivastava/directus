import { Dashboard } from '../types';
import api from '@/api';
import { defineStore } from 'pinia';

export const useInsightsStore = defineStore({
	id: 'insightsStore',
	state: () => ({
		dashboards: [] as Dashboard[],
	}),
	actions: {
		async hydrate() {
			const response = await api.get('/dashboards', {
				params: { limit: -1, fields: ['*', 'panels.*'], sort: ['name'] },
			});

			this.dashboards = response.data.data;
		},
		dehydrate() {
			this.reset();
		},
	},
});
