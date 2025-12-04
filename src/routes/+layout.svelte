<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Toast from '$lib/components/ui/Toast.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>YouTube Lead Generation</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<nav class="bg-white shadow-sm">
		<div class="container px-6 py-4 mx-auto">
			<div class="flex items-center justify-between">
				<h1 class="text-2xl font-bold text-primary-600">YouTube Lead Gen</h1>
				<div class="flex gap-4">
					<a href="/" class="text-gray-600 hover:text-gray-900">Home</a>
					<a href="/dashboard" class="text-gray-600 hover:text-gray-900">Dashboard</a>
				</div>
			</div>
		</div>
	</nav>

	<main class="container py-8 mx-auto">
		{@render children?.()}
	</main>

	<!-- Global Toast Notifications -->
	<Toast />
</div>
