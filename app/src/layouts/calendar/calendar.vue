<template>
	<div class="calendar-layout">
		<div ref="calendarElement" />
	</div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted, PropType, ref } from 'vue';

import '@fullcalendar/core/vdom';

export default defineComponent({
	inheritAttrs: false,
	props: {
		createCalendar: {
			type: Function as PropType<(calendarElement: HTMLElement) => void>,
			required: true,
		},
		destroyCalendar: {
			type: Function as PropType<() => void>,
			required: true,
		},
	},
	setup(props) {
		const calendarElement = ref<HTMLElement>();

		onMounted(() => {
			props.createCalendar(calendarElement.value!);
		});

		onUnmounted(() => {
			props.destroyCalendar();
		});

		return { calendarElement };
	},
});
</script>

<style lang="scss" scoped>
.calendar-layout {
	padding: var(--content-padding);
	padding-top: 0;
}
</style>
