<template>
	<component
		:is="layoutWrapper"
		ref="layoutRef"
		v-slot="{ layoutState }"
		v-model:selection="selection"
		v-model:layout-options="layoutOptions"
		v-model:layout-query="layoutQuery"
		v-model:filters="layoutFilters"
		v-model:search-query="searchQuery"
		collection="directus_users"
		:reset-preset="resetPreset"
	>
		<private-view :title="title">
			<template v-if="breadcrumb" #headline>
				<v-breadcrumb :items="breadcrumb" />
			</template>

			<template #title-outer:prepend>
				<v-button class="header-icon" rounded disabled icon secondary>
					<v-icon name="people_alt" outline />
				</v-button>
			</template>

			<template #actions:prepend>
				<component :is="`layout-actions-${layout}`" v-bind="layoutState" />
			</template>

			<template #actions>
				<search-input v-model="searchQuery" />

				<v-dialog v-if="selection.length > 0" v-model="confirmDelete" @esc="confirmDelete = false">
					<template #activator="{ on }">
						<v-button
							v-tooltip.bottom="batchDeleteAllowed ? t('delete_label') : t('not_allowed')"
							:disabled="batchDeleteAllowed !== true"
							rounded
							icon
							class="action-delete"
							@click="on"
						>
							<v-icon name="delete" outline />
						</v-button>
					</template>

					<v-card>
						<v-card-title>{{ t('batch_delete_confirm', selection.length) }}</v-card-title>

						<v-card-actions>
							<v-button secondary @click="confirmDelete = false">
								{{ t('cancel') }}
							</v-button>
							<v-button kind="danger" :loading="deleting" @click="batchDelete">
								{{ t('delete_label') }}
							</v-button>
						</v-card-actions>
					</v-card>
				</v-dialog>

				<v-button
					v-if="selection.length > 1"
					v-tooltip.bottom="batchEditAllowed ? t('edit') : t('not_allowed')"
					rounded
					icon
					class="action-batch"
					:disabled="batchEditAllowed === false"
					@click="batchEditActive = true"
				>
					<v-icon name="edit" outline />
				</v-button>

				<v-button
					v-if="canInviteUsers"
					v-tooltip.bottom="t('invite_users')"
					rounded
					icon
					class="invite-user"
					@click="userInviteModalActive = true"
				>
					<v-icon name="person_add" />
				</v-button>

				<v-button
					v-tooltip.bottom="createAllowed ? t('create_item') : t('not_allowed')"
					rounded
					icon
					:to="addNewLink"
					:disabled="createAllowed === false"
				>
					<v-icon name="add" />
				</v-button>
			</template>

			<template #navigation>
				<users-navigation :current-role="role" />
			</template>

			<users-invite v-if="canInviteUsers" v-model="userInviteModalActive" @update:model-value="refresh" />

			<component :is="`layout-${layout}`" class="layout" v-bind="layoutState">
				<template #no-results>
					<v-info :title="t('no_results')" icon="search" center>
						{{ t('no_results_copy') }}

						<template #append>
							<v-button @click="clearFilters">{{ t('clear_filters') }}</v-button>
						</template>
					</v-info>
				</template>

				<template #no-items>
					<v-info :title="t('user_count', 0)" icon="people_alt" center>
						{{ t('no_users_copy') }}

						<template v-if="canInviteUsers" #append>
							<v-button :to="role ? { path: `/users/roles/${role}/+` } : { path: '/users/+' }">
								{{ t('create_user') }}
							</v-button>
						</template>
					</v-info>
				</template>
			</component>

			<drawer-batch
				v-model:active="batchEditActive"
				:primary-keys="selection"
				collection="directus_users"
				@refresh="refresh"
			/>

			<template #sidebar>
				<sidebar-detail icon="info_outline" :title="t('information')" close>
					<div v-md="t('page_help_users_collection')" class="page-description" />
				</sidebar-detail>
				<layout-sidebar-detail v-model="layout">
					<component :is="`layout-options-${layout}`" v-bind="layoutState" />
				</layout-sidebar-detail>
				<component :is="`layout-sidebar-${layout}`" v-bind="layoutState" />
			</template>
		</private-view>
	</component>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, computed, ref } from 'vue';
import UsersNavigation from '../components/navigation.vue';
import UsersInvite from '@/views/private/components/users-invite';

import api from '@/api';
import usePreset from '@/composables/use-preset';
import LayoutSidebarDetail from '@/views/private/components/layout-sidebar-detail';
import SearchInput from '@/views/private/components/search-input';
import { useUserStore, usePermissionsStore } from '@/stores';
import useNavigation from '../composables/use-navigation';
import { useLayout } from '@/composables/use-layout';
import DrawerBatch from '@/views/private/components/drawer-batch';
import { Role } from '@directus/shared/types';

type Item = {
	[field: string]: any;
};

export default defineComponent({
	name: 'UsersCollection',
	components: { UsersNavigation, LayoutSidebarDetail, SearchInput, UsersInvite, DrawerBatch },
	props: {
		role: {
			type: String,
			default: null,
		},
	},
	setup(props) {
		const { t } = useI18n();

		const { roles } = useNavigation();
		const userInviteModalActive = ref(false);
		const userStore = useUserStore();
		const permissionsStore = usePermissionsStore();

		const layoutRef = ref();
		const selection = ref<Item[]>([]);

		const { layout, layoutOptions, layoutQuery, filters, searchQuery, resetPreset } = usePreset(ref('directus_users'));
		const { addNewLink } = useLinks();

		const { confirmDelete, deleting, batchDelete, error: deleteError, batchEditActive } = useBatch();

		const { breadcrumb, title } = useBreadcrumb();

		const layoutFilters = computed({
			get() {
				if (props.role !== null) {
					const roleFilter = {
						locked: true,
						operator: 'eq',
						field: 'role',
						value: props.role,
					};

					return [roleFilter, ...filters.value];
				}

				return filters.value;
			},
			set(newFilters) {
				filters.value = newFilters;
			},
		});

		const canInviteUsers = computed(() => {
			const isAdmin = !!userStore.currentUser?.role?.admin_access;

			if (isAdmin) return true;

			const usersCreatePermission = permissionsStore.permissions.find(
				(permission) => permission.collection === 'directus_users' && permission.action === 'create'
			);
			const rolesReadPermission = permissionsStore.permissions.find(
				(permission) => permission.collection === 'directus_roles' && permission.action === 'read'
			);

			return !!usersCreatePermission && !!rolesReadPermission;
		});

		const { layoutWrapper } = useLayout(layout);

		const { batchEditAllowed, batchDeleteAllowed, createAllowed } = usePermissions();

		return {
			t,
			canInviteUsers,
			addNewLink,
			breadcrumb,
			title,
			layoutRef,
			layoutWrapper,
			selection,
			layoutFilters,
			layoutOptions,
			layoutQuery,
			layout,
			searchQuery,
			clearFilters,
			userInviteModalActive,
			refresh,
			batchEditAllowed,
			batchDeleteAllowed,
			createAllowed,
			resetPreset,
			confirmDelete,
			deleting,
			batchDelete,
			deleteError,
			batchEditActive,
		};

		async function refresh() {
			await layoutRef.value?.state?.refresh?.();
		}

		function useBatch() {
			const confirmDelete = ref(false);
			const deleting = ref(false);

			const batchEditActive = ref(false);

			const error = ref<any>();

			return { batchEditActive, confirmDelete, deleting, batchDelete, error };

			async function batchDelete() {
				deleting.value = true;

				const batchPrimaryKeys = selection.value;

				try {
					await api.delete('/users', {
						data: batchPrimaryKeys,
					});

					await refresh();

					selection.value = [];
					confirmDelete.value = false;
				} catch (err: any) {
					error.value = err;
				} finally {
					deleting.value = false;
				}
			}
		}

		function useLinks() {
			const addNewLink = computed<string>(() => {
				return props.role ? `/users/roles/${props.role}/+` : '/users/+';
			});

			return { addNewLink };
		}

		function useBreadcrumb() {
			const breadcrumb = computed(() => {
				if (!props.role) return null;

				return [
					{
						name: t('user_directory'),
						to: `/users`,
					},
				];
			});

			const title = computed(() => {
				if (!props.role) return t('user_directory');
				return roles.value?.find((role: Role) => role.id === props.role)?.name;
			});

			return { breadcrumb, title };
		}

		function clearFilters() {
			filters.value = [];
			searchQuery.value = null;
		}

		function usePermissions() {
			const batchEditAllowed = computed(() => {
				const admin = userStore?.currentUser?.role.admin_access === true;
				if (admin) return true;

				const updatePermissions = permissionsStore.permissions.find(
					(permission) => permission.action === 'update' && permission.collection === 'directus_users'
				);
				return !!updatePermissions;
			});

			const batchDeleteAllowed = computed(() => {
				const admin = userStore?.currentUser?.role.admin_access === true;
				if (admin) return true;

				const deletePermissions = permissionsStore.permissions.find(
					(permission) => permission.action === 'delete' && permission.collection === 'directus_users'
				);
				return !!deletePermissions;
			});

			const createAllowed = computed(() => {
				const admin = userStore?.currentUser?.role.admin_access === true;
				if (admin) return true;

				const createPermissions = permissionsStore.permissions.find(
					(permission) => permission.action === 'create' && permission.collection === 'directus_users'
				);
				return !!createPermissions;
			});

			return { batchEditAllowed, batchDeleteAllowed, createAllowed };
		}
	},
});
</script>

<style lang="scss" scoped>
.action-delete {
	--v-button-background-color: var(--danger-10);
	--v-button-color: var(--danger);
	--v-button-background-color-hover: var(--danger-25);
	--v-button-color-hover: var(--danger);
}

.action-batch {
	--v-button-background-color: var(--warning-10);
	--v-button-color: var(--warning);
	--v-button-background-color-hover: var(--warning-25);
	--v-button-color-hover: var(--warning);
}

.header-icon {
	--v-button-color-disabled: var(--foreground-normal);
}

.layout {
	--layout-offset-top: 64px;
}

.invite-user {
	--v-button-background-color: var(--primary-10);
	--v-button-color: var(--primary);
	--v-button-background-color-hover: var(--primary-25);
	--v-button-color-hover: var(--primary);
}
</style>
