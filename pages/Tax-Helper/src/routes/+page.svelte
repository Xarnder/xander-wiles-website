<script lang="ts">
	import {
		ArrowLeft,
		ArrowRight,
		BadgeCheck,
		Download,
		FileSpreadsheet,
		Filter,
		LockKeyhole,
		Moon,
		Plus,
		Save,
		Search,
		ShieldCheck,
		Sun,
		Trash2,
		UploadCloud,
		X
	} from '@lucide/svelte';
	import { Ofx, type NormalizedTransaction } from 'ofx-data-extractor';
	import Papa from 'papaparse';

	type Transaction = {
		id: string;
		date: Date;
		description: string;
		amount: number;
		bankOrigin: string;
	};

	type ImportResult = {
		fileName: string;
		bankOrigin: string;
		rowsImported: number;
		rowsSkipped: number;
		fileType: 'CSV' | 'OFX';
	};

	type CsvMapping = {
		date: string;
		description: string;
		amount: string;
		income: string;
		expense: string;
	};

	type PendingCsv = {
		id: string;
		fileName: string;
		bankOrigin: string;
		headers: string[];
		rows: Record<string, string>[];
		mapping: CsvMapping;
	};

	type SavedTable = {
		id: string;
		kind: 'filtered' | 'selected';
		name: string;
		createdAt: string;
		transactionIds: string[];
	};

	const interestTerms = ['interest', 'int added', 'gross interest'];
	const currencyFormatter = new Intl.NumberFormat('en-GB', {
		style: 'currency',
		currency: 'GBP'
	});

	let transactions = $state<Transaction[]>([]);
	let importResults = $state<ImportResult[]>([]);
	let pendingCsvs = $state<PendingCsv[]>([]);
	let importError = $state('');
	let isDragging = $state(false);
	let isImporting = $state(false);
	let searchText = $state('');
	let transactionType = $state<'all' | 'income' | 'expenses'>('all');
	let isolateInterest = $state(false);
	let isolatePayer = $state(false);
	let payerName = $state('');
	let selectedTransactionIds = $state<string[]>([]);
	let savedTables = $state<SavedTable[]>([]);
	let activeSubTableIndex = $state(-1);
	let isRowDragSelecting = $state(false);
	let dragSelectionMode = $state<'select' | 'deselect'>('select');
	let isDarkMode = $state(true);
	let dragVisitedIds = new Set<string>();

	$effect(() => {
		document.body.classList.toggle('dark-page', isDarkMode);
	});

	let filteredTransactions = $derived.by(() => {
		const query = normalizeText(searchText);
		const payer = normalizeText(payerName);

		return transactions.filter((transaction) => {
			const description = normalizeText(transaction.description);

			if (query && !description.includes(query)) return false;
			if (transactionType === 'income' && transaction.amount <= 0) return false;
			if (transactionType === 'expenses' && transaction.amount >= 0) return false;
			if (isolateInterest && !interestTerms.some((term) => description.includes(term))) return false;
			if (isolatePayer && payer && (transaction.amount <= 0 || !description.includes(payer))) {
				return false;
			}

			return true;
		});
	});

	let summary = $derived(summarizeTransactions(filteredTransactions));
	let selectedIdSet = $derived(new Set(selectedTransactionIds));
	let selectedTransactions = $derived(transactions.filter((transaction) => selectedIdSet.has(transaction.id)));
	let selectedSummary = $derived(summarizeTransactions(selectedTransactions));
	let visibleSelectedCount = $derived(
		filteredTransactions.filter((transaction) => selectedIdSet.has(transaction.id)).length
	);
	let allVisibleSelected = $derived(
		filteredTransactions.length > 0 && visibleSelectedCount === filteredTransactions.length
	);
	let activeSavedSubTable = $derived(
		activeSubTableIndex >= 0 ? (savedTables[activeSubTableIndex] ?? null) : null
	);
	let activeSubTableLabel = $derived(
		activeSavedSubTable
			? `${activeSavedSubTable.name} (${activeSubTableIndex + 1} of ${savedTables.length})`
			: 'Working table'
	);

	let bankBreakdown = $derived.by(() => {
		const counts = new Map<string, number>();

		for (const transaction of transactions) {
			counts.set(transaction.bankOrigin, (counts.get(transaction.bankOrigin) ?? 0) + 1);
		}

		return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
	});

	function normalizeText(value: string) {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim()
			.toLowerCase();
	}

	function inferBankOrigin(fileName: string, content = '', headers: string[] = []) {
		const sample = normalizeText([fileName, content.slice(0, 800), headers.join(' ')].join(' '));

		if (sample.includes('nationwide')) return 'Nationwide';
		if (sample.includes('santander')) return 'Santander';
		if (sample.includes('barclays')) return 'Barclays';
		if (sample.includes('lloyds')) return 'Lloyds';
		if (sample.includes('monzo')) return 'Monzo';
		if (sample.includes('starling')) return 'Starling';

		return 'Unknown';
	}

	function findColumn(headers: string[], aliases: string[]) {
		const exact = headers.find((header) => aliases.includes(normalizeHeader(header)));
		if (exact) return exact;

		return headers.find((header) =>
			aliases.some((alias) => normalizeHeader(header).includes(alias) || alias.includes(normalizeHeader(header)))
		);
	}

	function normalizeHeader(header: string) {
		return normalizeText(header).replace(/[^a-z0-9]+/g, ' ').trim();
	}

	function createDefaultMapping(headers: string[]): CsvMapping {
		return {
			date:
				findColumn(headers, [
					'date',
					'transaction date',
					'posted date',
					'date posted',
					'booking date',
					'value date'
				]) ?? '',
			description:
				findColumn(headers, [
					'description',
					'details',
					'narrative',
					'memo',
					'name',
					'merchant',
					'reference',
					'transaction description'
				]) ?? '',
			amount:
				findColumn(headers, [
					'amount',
					'transaction amount',
					'value',
					'amount gbp',
					'paid in paid out',
					'credit debit'
				]) ?? '',
			income:
				findColumn(headers, ['paid in', 'money in', 'credit', 'deposit', 'receipts', 'in']) ?? '',
			expense:
				findColumn(headers, ['paid out', 'money out', 'debit', 'withdrawal', 'payments', 'out']) ?? ''
		};
	}

	function mappingIsReady(mapping: CsvMapping) {
		return Boolean(mapping.date && mapping.description && (mapping.amount || mapping.income || mapping.expense));
	}

	function readFileAsText(file: File) {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	}

	async function handleFiles(fileList: FileList | File[] | null | undefined) {
		const files = Array.from(fileList ?? []);
		if (!files.length) return;

		isImporting = true;
		importError = '';

		try {
			for (const file of files) {
				const extension = file.name.split('.').pop()?.toLowerCase();
				if (extension === 'ofx') {
					await importOfxFile(file);
				} else if (extension === 'csv') {
					await prepareCsvFile(file);
				} else {
					importError = `${file.name} is not supported. Upload a .csv or .ofx statement.`;
				}
			}
		} finally {
			isImporting = false;
		}
	}

	async function importOfxFile(file: File) {
		const text = await readFileAsText(file);
		const bankOrigin = inferBankOrigin(file.name, text);
		const ofx = new Ofx(text, { parserMode: 'lenient' });
		const normalized = ofx.toNormalized({
			amountMode: 'number',
			dateMode: 'iso'
		}).transactions;

		const imported = normalized
			.map((transaction, index) => normalizeOfxTransaction(transaction, bankOrigin, file.name, index))
			.filter((transaction): transaction is Transaction => Boolean(transaction));

		transactions = [...transactions, ...imported];
		importResults = [
			{
				fileName: file.name,
				bankOrigin,
				rowsImported: imported.length,
				rowsSkipped: normalized.length - imported.length,
				fileType: 'OFX'
			},
			...importResults
		];
	}

	function normalizeOfxTransaction(
		transaction: NormalizedTransaction,
		bankOrigin: string,
		fileName: string,
		index: number
	): Transaction | null {
		const date = parseDateValue(transaction.postedAt);
		const amount = Number(transaction.amount);
		const description = String(transaction.description || transaction.raw?.NAME || transaction.raw?.MEMO || '')
			.replace(/\s+/g, ' ')
			.trim();

		if (!date || !Number.isFinite(amount) || !description) return null;

		return {
			id: stableId([fileName, bankOrigin, date.toISOString(), description, String(amount), String(index)]),
			date,
			description,
			amount,
			bankOrigin
		};
	}

	async function prepareCsvFile(file: File) {
		const text = await readFileAsText(file);
		const parsed = Papa.parse<Record<string, string>>(text, {
			header: true,
			skipEmptyLines: 'greedy',
			transformHeader: (header) => header.trim()
		});

		if (parsed.errors.some((error) => error.type === 'Delimiter')) {
			importError = `${file.name} could not be read as CSV. Check the delimiter or export format.`;
			return;
		}

		const rows = parsed.data.filter((row) =>
			Object.values(row).some((value) => String(value ?? '').trim().length)
		);
		const headers = parsed.meta.fields?.filter(Boolean) ?? Object.keys(rows[0] ?? {});
		const bankOrigin = inferBankOrigin(file.name, text, headers);
		const mapping = createDefaultMapping(headers);

		if (mappingIsReady(mapping)) {
			importMappedCsv({ id: stableId([file.name, String(Date.now())]), fileName: file.name, bankOrigin, headers, rows, mapping });
		} else {
			pendingCsvs = [
				...pendingCsvs,
				{
					id: stableId([file.name, String(Date.now()), String(rows.length)]),
					fileName: file.name,
					bankOrigin,
					headers,
					rows,
					mapping
				}
			];
		}
	}

	function importMappedCsv(pending: PendingCsv) {
		const imported: Transaction[] = [];
		let rowsSkipped = 0;

		pending.rows.forEach((row, index) => {
			const transaction = normalizeCsvRow(row, pending.mapping, pending.bankOrigin, pending.fileName, index);

			if (transaction) {
				imported.push(transaction);
			} else {
				rowsSkipped += 1;
			}
		});

		transactions = [...transactions, ...imported];
		importResults = [
			{
				fileName: pending.fileName,
				bankOrigin: pending.bankOrigin,
				rowsImported: imported.length,
				rowsSkipped,
				fileType: 'CSV'
			},
			...importResults
		];
		pendingCsvs = pendingCsvs.filter((item) => item.id !== pending.id);
	}

	function normalizeCsvRow(
		row: Record<string, string>,
		mapping: CsvMapping,
		bankOrigin: string,
		fileName: string,
		index: number
	): Transaction | null {
		const date = parseDateValue(row[mapping.date]);
		const description = String(row[mapping.description] ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		const amount = resolveCsvAmount(row, mapping);

		if (!date || !description || amount === null) return null;

		return {
			id: stableId([fileName, bankOrigin, date.toISOString(), description, String(amount), String(index)]),
			date,
			description,
			amount,
			bankOrigin
		};
	}

	function resolveCsvAmount(row: Record<string, string>, mapping: CsvMapping) {
		if (mapping.amount) {
			const amount = parseMoney(row[mapping.amount]);
			if (amount !== null) return amount;
		}

		const income = mapping.income ? parseMoney(row[mapping.income]) : null;
		const expense = mapping.expense ? parseMoney(row[mapping.expense]) : null;

		if (income !== null && Math.abs(income) > 0) return Math.abs(income);
		if (expense !== null && Math.abs(expense) > 0) return -Math.abs(expense);

		return null;
	}

	function parseMoney(value: unknown) {
		let raw = String(value ?? '').trim();
		if (!raw) return null;

		const isNegative = /^\(.*\)$/.test(raw) || /\b(dr|debit)\b/i.test(raw) || raw.startsWith('-');
		raw = raw
			.replace(/[£$€,\s]/g, '')
			.replace(/[()]/g, '')
			.replace(/\b(cr|dr|credit|debit)\b/gi, '');

		const amount = Number(raw);
		if (!Number.isFinite(amount)) return null;

		return isNegative ? -Math.abs(amount) : amount;
	}

	function parseDateValue(value: unknown) {
		if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

		const raw = String(value ?? '').trim();
		if (!raw) return null;

		const ofxDate = raw.match(/^(\d{4})(\d{2})(\d{2})/);
		if (ofxDate) {
			const parsed = new Date(Date.UTC(Number(ofxDate[1]), Number(ofxDate[2]) - 1, Number(ofxDate[3])));
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		const iso = new Date(raw);
		if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !Number.isNaN(iso.getTime())) return iso;

		const slashDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
		if (slashDate) {
			const year = Number(slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3]);
			const parsed = new Date(Date.UTC(year, Number(slashDate[2]) - 1, Number(slashDate[1])));
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		const fallback = new Date(raw);
		return Number.isNaN(fallback.getTime()) ? null : fallback;
	}

	function stableId(parts: string[]) {
		const input = parts.join('|');
		let hash = 0;

		for (let index = 0; index < input.length; index += 1) {
			hash = (hash << 5) - hash + input.charCodeAt(index);
			hash |= 0;
		}

		return `txn-${Math.abs(hash).toString(36)}`;
	}

	function formatDate(date: Date) {
		return date.toISOString().slice(0, 10);
	}

	function formatAmount(amount: number) {
		return currencyFormatter.format(amount);
	}

	function summarizeTransactions(rows: Transaction[]) {
		const income = rows
			.filter((transaction) => transaction.amount > 0)
			.reduce((total, transaction) => total + transaction.amount, 0);
		const expenses = Math.abs(
			rows
				.filter((transaction) => transaction.amount < 0)
				.reduce((total, transaction) => total + transaction.amount, 0)
		);

		return {
			income,
			expenses,
			net: income - expenses
		};
	}

	function moneyIn(transaction: Transaction) {
		return transaction.amount > 0 ? formatAmount(transaction.amount) : '';
	}

	function moneyOut(transaction: Transaction) {
		return transaction.amount < 0 ? formatAmount(Math.abs(transaction.amount)) : '';
	}

	function exportTransactionsCsv(rows: Transaction[], label: string) {
		if (!rows.length) return;

		const csv = Papa.unparse(
			rows.map((transaction) => ({
				Date: formatDate(transaction.date),
				'Bank Origin': transaction.bankOrigin,
				Description: transaction.description,
				'Money In': transaction.amount > 0 ? transaction.amount.toFixed(2) : '',
				'Money Out': transaction.amount < 0 ? Math.abs(transaction.amount).toFixed(2) : '',
				Amount: transaction.amount.toFixed(2)
			}))
		);
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = `tax-helper-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	function exportFilteredCsv() {
		exportTransactionsCsv(filteredTransactions, 'filtered');
	}

	function exportSelectedCsv() {
		exportTransactionsCsv(selectedTransactions, 'selected');
	}

	function isSelected(transactionId: string) {
		return selectedIdSet.has(transactionId);
	}

	function markWorkingTable() {
		activeSubTableIndex = -1;
	}

	function toggleTransactionSelection(transactionId: string) {
		markWorkingTable();
		selectedTransactionIds = isSelected(transactionId)
			? selectedTransactionIds.filter((id) => id !== transactionId)
			: [...selectedTransactionIds, transactionId];
	}

	function toggleVisibleSelection() {
		markWorkingTable();
		if (allVisibleSelected) {
			const visibleIds = new Set(filteredTransactions.map((transaction) => transaction.id));
			selectedTransactionIds = selectedTransactionIds.filter((id) => !visibleIds.has(id));
			return;
		}

		selectedTransactionIds = Array.from(
			new Set([...selectedTransactionIds, ...filteredTransactions.map((transaction) => transaction.id)])
		);
	}

	function clearSelection() {
		markWorkingTable();
		selectedTransactionIds = [];
	}

	function saveTableToCache(kind: SavedTable['kind'], rows: Transaction[]) {
		const transactionIds = rows.map((transaction) => transaction.id);
		if (!transactionIds.length) return;

		const nextIndex = savedTables.length;
		const savedTable: SavedTable = {
			id: stableId([kind, String(Date.now()), transactionIds.join('|')]),
			kind,
			name: `${kind === 'filtered' ? 'Main' : 'Sub'} table ${nextIndex + 1}`,
			createdAt: new Date().toISOString(),
			transactionIds
		};

		savedTables = [...savedTables, savedTable];
		activeSubTableIndex = nextIndex;
		selectedTransactionIds = transactionIds;
	}

	function saveCurrentSubTable() {
		saveTableToCache('selected', selectedTransactions);
	}

	function saveFilteredMainTable() {
		saveTableToCache('filtered', filteredTransactions);
	}

	function startNewSubTable() {
		selectedTransactionIds = [];
		activeSubTableIndex = -1;
	}

	function loadSubTable(index: number) {
		const table = savedTables[index];
		if (!table) return;

		const validIds = new Set(transactions.map((transaction) => transaction.id));
		selectedTransactionIds = table.transactionIds.filter((id) => validIds.has(id));
		activeSubTableIndex = index;
	}

	function navigateSubTables(direction: -1 | 1) {
		if (!savedTables.length) return;

		if (activeSubTableIndex < 0) {
			loadSubTable(direction > 0 ? 0 : savedTables.length - 1);
			return;
		}

		const nextIndex =
			(activeSubTableIndex + direction + savedTables.length) % savedTables.length;
		loadSubTable(nextIndex);
	}

	function deleteCachedTable(tableId: string) {
		const deletedIndex = savedTables.findIndex((table) => table.id === tableId);
		if (deletedIndex < 0) return;

		savedTables = savedTables.filter((table) => table.id !== tableId);

		if (!savedTables.length) {
			activeSubTableIndex = -1;
			return;
		}

		if (activeSubTableIndex === deletedIndex) {
			loadSubTable(Math.min(deletedIndex, savedTables.length - 1));
		} else if (activeSubTableIndex > deletedIndex) {
			activeSubTableIndex -= 1;
		}
	}

	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
	}

	function isInteractiveTarget(target: EventTarget | null) {
		return (
			target instanceof Element &&
			Boolean(target.closest('input, button, select, textarea, a, label'))
		);
	}

	function applyDragSelection(transactionId: string) {
		if (dragVisitedIds.has(transactionId)) return;

		dragVisitedIds.add(transactionId);
		markWorkingTable();

		if (dragSelectionMode === 'select') {
			selectedTransactionIds = Array.from(new Set([...selectedTransactionIds, transactionId]));
			return;
		}

		selectedTransactionIds = selectedTransactionIds.filter((id) => id !== transactionId);
	}

	function beginRowDragSelection(event: PointerEvent, transactionId: string) {
		if (event.button !== 0 || isInteractiveTarget(event.target)) return;

		isRowDragSelecting = true;
		dragSelectionMode = isSelected(transactionId) ? 'deselect' : 'select';
		dragVisitedIds = new Set<string>();
		applyDragSelection(transactionId);
		event.preventDefault();
	}

	function continueRowDragSelection(transactionId: string) {
		if (!isRowDragSelecting) return;
		applyDragSelection(transactionId);
	}

	function endRowDragSelection() {
		isRowDragSelecting = false;
		dragVisitedIds = new Set<string>();
	}

	function handleSubTableKeydown(event: KeyboardEvent) {
		if (isInteractiveTarget(event.target) || !savedTables.length) return;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			navigateSubTables(-1);
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			navigateSubTables(1);
		}
	}

	function resetFilters() {
		searchText = '';
		transactionType = 'all';
		isolateInterest = false;
		isolatePayer = false;
		payerName = '';
	}

	function clearData() {
		transactions = [];
		importResults = [];
		pendingCsvs = [];
		selectedTransactionIds = [];
		savedTables = [];
		activeSubTableIndex = -1;
		importError = '';
		resetFilters();
	}

	function handleInputChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		void handleFiles(input.files);
		input.value = '';
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		if (event.currentTarget === event.target) isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		void handleFiles(event.dataTransfer?.files);
	}
</script>

<svelte:head>
	<title>Tax Helper</title>
	<meta
		name="description"
		content="A privacy-first browser tool for normalising and filtering bank transactions for tax records."
	/>
</svelte:head>

<svelte:window onpointerup={endRowDragSelection} onkeydown={handleSubTableKeydown} />

<main class:dark-mode={isDarkMode} class="app-shell">
	<header class="topbar">
		<div>
			<p class="eyebrow"><LockKeyhole size={16} aria-hidden="true" /> Browser-only processing</p>
			<h1>Tax Helper</h1>
			<p class="intro">
				Normalize CSV and OFX bank statements, isolate tax-relevant rows, and export a clean
				spreadsheet without sending financial data anywhere.
			</p>
		</div>
		<div class="privacy-mark" aria-label="Privacy promise">
			<ShieldCheck size={24} aria-hidden="true" />
			<span>Local files stay local</span>
		</div>
		<button class="theme-toggle" type="button" aria-pressed={isDarkMode} onclick={toggleDarkMode}>
			{#if isDarkMode}
				<Sun size={18} aria-hidden="true" />
				<span>Light mode</span>
			{:else}
				<Moon size={18} aria-hidden="true" />
				<span>Dark mode</span>
			{/if}
		</button>
	</header>

	<section
		class:dragging={isDragging}
		class="upload-zone"
		role="group"
		aria-label="File upload dropzone"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		<div class="upload-icon">
			<UploadCloud size={30} aria-hidden="true" />
		</div>
		<div>
			<h2>Drop bank statements here</h2>
			<p>Accepts .csv and .ofx files from Nationwide, Santander, and similar bank exports.</p>
		</div>
		<label class="button primary" for="file-input">
			<FileSpreadsheet size={18} aria-hidden="true" />
			<span>{isImporting ? 'Importing...' : 'Choose files'}</span>
		</label>
		<input id="file-input" type="file" accept=".csv,.ofx" multiple onchange={handleInputChange} />
	</section>

	{#if importError}
		<div class="notice error" role="alert">
			<X size={18} aria-hidden="true" />
			<span>{importError}</span>
		</div>
	{/if}

	{#if importResults.length}
		<section class="import-strip" aria-label="Imported files">
			{#each importResults.slice(0, 4) as result}
				<div class="import-pill">
					<BadgeCheck size={16} aria-hidden="true" />
					<span>
						<strong>{result.bankOrigin}</strong> {result.fileType}: {result.rowsImported} rows imported
						{#if result.rowsSkipped}
							({result.rowsSkipped} skipped)
						{/if}
					</span>
				</div>
			{/each}
		</section>
	{/if}

	{#if pendingCsvs.length}
		<section class="mapping-section" aria-labelledby="mapping-heading">
			<div>
				<p class="section-kicker">CSV mapping needed</p>
				<h2 id="mapping-heading">Match your columns</h2>
			</div>
			<div class="mapping-grid">
				{#each pendingCsvs as pending}
					<article class="mapping-panel">
						<div class="mapping-panel__header">
							<div>
								<h3>{pending.fileName}</h3>
								<p>{pending.rows.length} rows detected from {pending.bankOrigin}</p>
							</div>
							<button class="icon-button" aria-label={`Remove ${pending.fileName}`} onclick={() => (pendingCsvs = pendingCsvs.filter((item) => item.id !== pending.id))}>
								<X size={18} aria-hidden="true" />
							</button>
						</div>
						<div class="mapping-fields">
							<label>
								<span>Date</span>
								<select bind:value={pending.mapping.date}>
									<option value="">Choose column</option>
									{#each pending.headers as header}
										<option value={header}>{header}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Description</span>
								<select bind:value={pending.mapping.description}>
									<option value="">Choose column</option>
									{#each pending.headers as header}
										<option value={header}>{header}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Signed amount</span>
								<select bind:value={pending.mapping.amount}>
									<option value="">None</option>
									{#each pending.headers as header}
										<option value={header}>{header}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Income column</span>
								<select bind:value={pending.mapping.income}>
									<option value="">None</option>
									{#each pending.headers as header}
										<option value={header}>{header}</option>
									{/each}
								</select>
							</label>
							<label>
								<span>Expense column</span>
								<select bind:value={pending.mapping.expense}>
									<option value="">None</option>
									{#each pending.headers as header}
										<option value={header}>{header}</option>
									{/each}
								</select>
							</label>
						</div>
						<button
							class="button primary"
							disabled={!mappingIsReady(pending.mapping)}
							onclick={() => importMappedCsv(pending)}
						>
							<UploadCloud size={18} aria-hidden="true" />
							<span>Import mapped CSV</span>
						</button>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	<section class="workspace">
		<aside class="filters" aria-labelledby="filters-heading">
			<div class="panel-heading">
				<Filter size={18} aria-hidden="true" />
				<h2 id="filters-heading">Filters</h2>
			</div>

			<label class="search-field">
				<span>Text search</span>
				<div>
					<Search size={17} aria-hidden="true" />
					<input bind:value={searchText} type="search" placeholder="Interest, Acme, invoice..." />
				</div>
			</label>

			<label>
				<span>Transaction type</span>
				<select bind:value={transactionType}>
					<option value="all">All transactions</option>
					<option value="income">Income only</option>
					<option value="expenses">Expenses only</option>
				</select>
			</label>

			<div class="rule-group" aria-label="Quick-filter tax rules">
				<label class="check-row">
					<input type="checkbox" bind:checked={isolateInterest} />
					<span>Isolate bank interest</span>
				</label>
				<label class="check-row">
					<input type="checkbox" bind:checked={isolatePayer} />
					<span>Isolate payer or company</span>
				</label>
				<input
					bind:value={payerName}
					type="text"
					placeholder="Client or company name"
					disabled={!isolatePayer}
					aria-label="Payer or company name"
				/>
			</div>

			<div class="filter-actions">
				<button class="button secondary" onclick={resetFilters}>Reset filters</button>
				<button class="button secondary" disabled={!transactions.length} onclick={clearData}>Clear data</button>
			</div>

			{#if bankBreakdown.length}
				<div class="bank-list" aria-label="Imported bank totals">
					{#each bankBreakdown as [bank, count]}
						<span><strong>{bank}</strong>{count}</span>
					{/each}
				</div>
			{/if}
		</aside>

		<section class="results" aria-label="Filtered transaction results">
			<div class="summary-grid" aria-label="Financial summary">
				<article class="summary-card">
					<span>Total taxable income</span>
					<strong>{formatAmount(summary.income)}</strong>
				</article>
				<article class="summary-card">
					<span>Total deductible expenses</span>
					<strong>{formatAmount(summary.expenses)}</strong>
				</article>
				<article class="summary-card net" class:negative={summary.net < 0}>
					<span>Net position</span>
					<strong>{formatAmount(summary.net)}</strong>
				</article>
			</div>

			<div class="table-toolbar">
				<div>
					<h2>Transactions</h2>
					<p>
						{filteredTransactions.length} visible of {transactions.length} imported, {selectedTransactions.length}
						selected
					</p>
				</div>
				<div class="toolbar-actions">
					<button class="button secondary" disabled={!filteredTransactions.length} onclick={toggleVisibleSelection}>
						<span>{allVisibleSelected ? 'Unselect visible' : 'Select visible'}</span>
					</button>
					<button class="button secondary" disabled={!filteredTransactions.length} onclick={saveFilteredMainTable}>
						<Save size={18} aria-hidden="true" />
						<span>Save main table</span>
					</button>
					<button
						class="button primary"
						disabled={!filteredTransactions.length}
						onclick={exportFilteredCsv}
					>
						<Download size={18} aria-hidden="true" />
						<span>Export filtered CSV</span>
					</button>
				</div>
			</div>

			{#if transactions.length}
				<div class:drag-selecting={isRowDragSelecting} class="table-wrap">
					<table>
						<thead>
							<tr>
								<th class="select-cell">
									<input
										type="checkbox"
										aria-label="Select all visible transactions"
										checked={allVisibleSelected}
										onchange={toggleVisibleSelection}
									/>
								</th>
								<th class="row-number-cell">#</th>
								<th>Date</th>
								<th>Bank Origin</th>
								<th>Description</th>
								<th class="amount-cell">Money In</th>
								<th class="amount-cell">Money Out</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredTransactions as transaction, index (transaction.id)}
								<tr
									class:selected-row={isSelected(transaction.id)}
									onpointerdown={(event) => beginRowDragSelection(event, transaction.id)}
									onpointerenter={() => continueRowDragSelection(transaction.id)}
								>
									<td class="select-cell">
										<input
											type="checkbox"
											aria-label={`Select transaction ${transaction.description}`}
											checked={isSelected(transaction.id)}
											onchange={() => toggleTransactionSelection(transaction.id)}
										/>
									</td>
									<td class="row-number-cell">{index + 1}</td>
									<td>{formatDate(transaction.date)}</td>
									<td><span class="bank-tag">{transaction.bankOrigin}</span></td>
									<td>{transaction.description}</td>
									<td class="amount-cell income">{moneyIn(transaction)}</td>
									<td class="amount-cell expense">{moneyOut(transaction)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if !filteredTransactions.length}
						<div class="empty-inline">No transactions match the current filters.</div>
					{/if}
				</div>

				<section class="selected-panel" aria-labelledby="selected-heading">
					<div class="subtable-navigator" aria-label="Cached sub-table navigation">
						<button
							class="icon-button"
							aria-label="Previous cached sub-table"
							disabled={!savedTables.length}
							onclick={() => navigateSubTables(-1)}
						>
							<ArrowLeft size={18} aria-hidden="true" />
						</button>
						<div class="subtable-status">
							<span>{activeSubTableLabel}</span>
							<strong>{savedTables.length} saved</strong>
						</div>
						<button
							class="icon-button"
							aria-label="Next cached sub-table"
							disabled={!savedTables.length}
							onclick={() => navigateSubTables(1)}
						>
							<ArrowRight size={18} aria-hidden="true" />
						</button>
					</div>

					{#if savedTables.length}
						<div class="cache-list" aria-label="Cached tables">
							{#each savedTables as table, index (table.id)}
								<button
									class:active-cache={index === activeSubTableIndex}
									class="cache-chip"
									type="button"
									onclick={() => loadSubTable(index)}
								>
									<span>{table.name}</span>
									<small>{table.kind === 'filtered' ? 'Main' : 'Sub'} · {table.transactionIds.length}</small>
								</button>
								<button
									class="icon-button danger"
									type="button"
									aria-label={`Delete ${table.name} from cache`}
									onclick={() => deleteCachedTable(table.id)}
								>
									<Trash2 size={17} aria-hidden="true" />
								</button>
							{/each}
						</div>
					{/if}

					<div class="table-toolbar">
						<div>
							<h2 id="selected-heading">Selected tax table</h2>
							<p>
								{selectedTransactions.length} rows selected for this sub-table
								{#if activeSavedSubTable}
									, cached as {activeSavedSubTable.kind === 'filtered' ? 'main' : 'sub'} table
								{/if}
							</p>
						</div>
						<div class="toolbar-actions">
							{#if activeSavedSubTable}
								<button
									class="button secondary danger-text"
									onclick={() => deleteCachedTable(activeSavedSubTable.id)}
								>
									<Trash2 size={18} aria-hidden="true" />
									<span>Delete cached</span>
								</button>
							{/if}
							<button
								class="button secondary"
								disabled={!selectedTransactions.length}
								onclick={saveCurrentSubTable}
							>
								<Save size={18} aria-hidden="true" />
								<span>Save table</span>
							</button>
							<button class="button secondary" onclick={startNewSubTable}>
								<Plus size={18} aria-hidden="true" />
								<span>New table</span>
							</button>
							<button class="button secondary" disabled={!selectedTransactions.length} onclick={clearSelection}>
								Clear
							</button>
							<button
								class="button primary"
								disabled={!selectedTransactions.length}
								onclick={exportSelectedCsv}
							>
								<Download size={18} aria-hidden="true" />
								<span>Export selected CSV</span>
							</button>
						</div>
					</div>

					<div class="selected-total-grid" aria-label="Selected transaction totals">
						<div>
							<span>Selected in</span>
							<strong>{formatAmount(selectedSummary.income)}</strong>
						</div>
						<div>
							<span>Selected out</span>
							<strong>{formatAmount(selectedSummary.expenses)}</strong>
						</div>
						<div class:negative={selectedSummary.net < 0}>
							<span>Selected net</span>
							<strong>{formatAmount(selectedSummary.net)}</strong>
						</div>
					</div>

					{#if selectedTransactions.length}
						<div class="table-wrap sub-table">
							<table>
								<thead>
									<tr>
										<th class="row-number-cell">#</th>
										<th>Date</th>
										<th>Bank Origin</th>
										<th>Description</th>
										<th class="amount-cell">Money In</th>
										<th class="amount-cell">Money Out</th>
									</tr>
								</thead>
								<tbody>
									{#each selectedTransactions as transaction, index (transaction.id)}
										<tr>
											<td class="row-number-cell">{index + 1}</td>
											<td>{formatDate(transaction.date)}</td>
											<td><span class="bank-tag">{transaction.bankOrigin}</span></td>
											<td>{transaction.description}</td>
											<td class="amount-cell income">{moneyIn(transaction)}</td>
											<td class="amount-cell expense">{moneyOut(transaction)}</td>
										</tr>
									{/each}
								</tbody>
								<tfoot>
									<tr>
										<td colspan="4">Selected total</td>
										<td class="amount-cell income">{formatAmount(selectedSummary.income)}</td>
										<td class="amount-cell expense">{formatAmount(selectedSummary.expenses)}</td>
									</tr>
								</tfoot>
							</table>
						</div>
					{:else}
						<div class="empty-inline selected-empty">
							Select rows in the main table to build a custom tax table.
						</div>
					{/if}
				</section>
			{:else}
				<div class="empty-state">
					<LockKeyhole size={34} aria-hidden="true" />
					<h2>No statement loaded yet</h2>
					<p>
						Upload a CSV or OFX file to start. Parsing, filtering, tagging, summaries, and exports all
						run inside this browser session.
					</p>
				</div>
			{/if}
		</section>
	</section>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		background: #f5f7f5;
		color: #1f2924;
		font-family:
			Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}

	:global(body.dark-page) {
		background: #000000;
		color: #edf5f0;
	}

	button,
	input,
	select {
		font: inherit;
	}

	button {
		cursor: pointer;
	}

	button:disabled,
	input:disabled {
		cursor: not-allowed;
		opacity: 0.58;
	}

	.app-shell {
		width: min(1440px, 100%);
		margin: 0 auto;
		padding: 28px;
	}

	.topbar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 24px;
		align-items: start;
		margin-bottom: 24px;
	}

	.eyebrow,
	.section-kicker {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 10px;
		color: #3d6f5a;
		font-size: 0.83rem;
		font-weight: 750;
		text-transform: uppercase;
	}

	h1,
	h2,
	h3,
	p {
		margin-top: 0;
	}

	h1 {
		margin-bottom: 10px;
		font-size: clamp(2.1rem, 5vw, 4.4rem);
		line-height: 0.98;
		letter-spacing: 0;
	}

	h2 {
		margin-bottom: 12px;
		font-size: 1.12rem;
		letter-spacing: 0;
	}

	h3 {
		margin-bottom: 4px;
		font-size: 1rem;
		letter-spacing: 0;
	}

	.intro {
		max-width: 720px;
		margin-bottom: 0;
		color: #5e6b64;
		font-size: 1.04rem;
		line-height: 1.55;
	}

	.privacy-mark {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		border: 1px solid #cfe2d9;
		border-radius: 8px;
		padding: 12px 14px;
		background: #ffffff;
		color: #2e604c;
		font-weight: 750;
		box-shadow: 0 16px 34px rgb(31 41 36 / 7%);
	}

	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 50px;
		border: 1px solid #cfe2d9;
		border-radius: 8px;
		background: #ffffff;
		color: #2e604c;
		padding: 0 14px;
		font-weight: 800;
		white-space: nowrap;
		box-shadow: 0 16px 34px rgb(31 41 36 / 7%);
	}

	.upload-zone {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 18px;
		align-items: center;
		min-height: 132px;
		margin-bottom: 18px;
		border: 1.5px dashed #9fbcaf;
		border-radius: 8px;
		padding: 24px;
		background: #ffffff;
		transition:
			border-color 160ms ease,
			background 160ms ease,
			transform 160ms ease;
	}

	.upload-zone.dragging {
		border-color: #2d7c5b;
		background: #eef8f3;
		transform: translateY(-1px);
	}

	.upload-icon {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 8px;
		background: #e8f3ee;
		color: #2e604c;
	}

	.upload-zone h2 {
		margin-bottom: 5px;
	}

	.upload-zone p {
		margin-bottom: 0;
		color: #607069;
	}

	#file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	.button,
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 8px;
		font-weight: 750;
		white-space: nowrap;
	}

	.button {
		gap: 8px;
		min-height: 42px;
		padding: 0 15px;
	}

	.primary {
		background: #23654c;
		color: #ffffff;
	}

	.secondary {
		border: 1px solid #d6dfda;
		background: #ffffff;
		color: #314039;
	}

	.icon-button {
		width: 36px;
		height: 36px;
		background: #edf2ef;
		color: #3f4f47;
	}

	.notice {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-bottom: 18px;
		border-radius: 8px;
		padding: 12px 14px;
		font-weight: 700;
	}

	.notice.error {
		background: #ffecec;
		color: #8a2727;
	}

	.import-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 18px;
	}

	.import-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border: 1px solid #cae3d7;
		border-radius: 8px;
		padding: 9px 12px;
		background: #f4fbf7;
		color: #2f5c4a;
		font-size: 0.92rem;
	}

	.mapping-section,
	.filters,
	.results {
		border: 1px solid #dce4df;
		border-radius: 8px;
		background: #ffffff;
		box-shadow: 0 18px 48px rgb(31 41 36 / 8%);
	}

	.mapping-section {
		margin-bottom: 20px;
		padding: 20px;
	}

	.mapping-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 14px;
	}

	.mapping-panel {
		border: 1px solid #d9e3de;
		border-radius: 8px;
		padding: 16px;
	}

	.mapping-panel__header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}

	.mapping-panel__header p {
		margin-bottom: 0;
		color: #66756e;
		font-size: 0.9rem;
	}

	.mapping-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 14px;
	}

	label {
		display: grid;
		gap: 7px;
		color: #435249;
		font-size: 0.9rem;
		font-weight: 700;
	}

	input,
	select {
		width: 100%;
		min-height: 42px;
		border: 1px solid #ccd8d2;
		border-radius: 8px;
		background: #ffffff;
		color: #1f2924;
		padding: 0 11px;
	}

	input:focus,
	select:focus,
	button:focus-visible,
	.button:focus-visible {
		outline: 3px solid #9ed9c1;
		outline-offset: 2px;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}

	.filters {
		position: sticky;
		top: 18px;
		display: grid;
		gap: 18px;
		padding: 18px;
	}

	.panel-heading,
	.table-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
	}

	.panel-heading {
		justify-content: flex-start;
	}

	.panel-heading h2,
	.table-toolbar h2 {
		margin-bottom: 0;
	}

	.search-field div {
		position: relative;
	}

	.search-field :global(svg) {
		position: absolute;
		top: 50%;
		left: 12px;
		color: #76847d;
		transform: translateY(-50%);
	}

	.search-field input {
		padding-left: 40px;
	}

	.rule-group {
		display: grid;
		gap: 10px;
		border-top: 1px solid #edf1ef;
		border-bottom: 1px solid #edf1ef;
		padding: 16px 0;
	}

	.check-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.check-row input {
		width: 18px;
		min-height: 18px;
		accent-color: #23654c;
	}

	.filter-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.bank-list {
		display: grid;
		gap: 8px;
	}

	.bank-list span {
		display: flex;
		justify-content: space-between;
		border-radius: 8px;
		background: #f3f6f4;
		padding: 9px 10px;
		color: #536158;
		font-size: 0.9rem;
	}

	.results {
		padding: 18px;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 18px;
	}

	.summary-card {
		display: grid;
		gap: 8px;
		min-height: 104px;
		border: 1px solid #dce7e1;
		border-radius: 8px;
		padding: 16px;
		background: #f9fbfa;
	}

	.summary-card span {
		color: #65756e;
		font-size: 0.88rem;
		font-weight: 750;
	}

	.summary-card strong {
		align-self: end;
		color: #173f31;
		font-size: clamp(1.35rem, 2.5vw, 2rem);
		letter-spacing: 0;
	}

	.summary-card.net {
		background: #ecf7f2;
	}

	.summary-card.net.negative {
		background: #fff2ef;
	}

	.summary-card.net.negative strong {
		color: #923524;
	}

	.table-toolbar {
		margin-bottom: 14px;
	}

	.toolbar-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: flex-end;
	}

	.table-toolbar p {
		margin-bottom: 0;
		color: #68766f;
		font-size: 0.92rem;
	}

	.table-wrap {
		overflow: auto;
		max-height: min(62vh, 720px);
		border: 1px solid #dde6e1;
		border-radius: 8px;
	}

	.table-wrap.drag-selecting,
	.table-wrap.drag-selecting * {
		cursor: crosshair;
		user-select: none;
	}

	table {
		width: 100%;
		min-width: 860px;
		border-collapse: collapse;
	}

	th,
	td {
		border-bottom: 1px solid #edf1ef;
		padding: 13px 14px;
		text-align: left;
		vertical-align: top;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 3;
		background: #f7faf8;
		color: #526259;
		font-size: 0.78rem;
		text-transform: uppercase;
	}

	tbody tr:hover {
		background: #f8fbf9;
	}

	tbody tr {
		cursor: pointer;
	}

	tbody tr.selected-row {
		background: #eef8f3;
	}

	tbody tr:last-child td {
		border-bottom: 0;
	}

	.bank-tag {
		display: inline-flex;
		border-radius: 999px;
		background: #e7f1ec;
		color: #2f604d;
		padding: 4px 9px;
		font-size: 0.82rem;
		font-weight: 800;
	}

	.amount-cell {
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.select-cell {
		width: 44px;
		text-align: center;
	}

	.row-number-cell {
		width: 52px;
		color: #6b7b72;
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 750;
	}

	.select-cell input {
		width: 18px;
		min-height: 18px;
		accent-color: #23654c;
	}

	.income {
		color: #117a4f;
		font-weight: 850;
	}

	.expense {
		color: #c3312b;
		font-weight: 850;
	}

	.selected-panel {
		margin-top: 20px;
		border-top: 1px solid #edf1ef;
		padding-top: 18px;
	}

	.subtable-navigator {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) 40px;
		gap: 10px;
		align-items: center;
		margin-bottom: 14px;
		border: 1px solid #dce7e1;
		border-radius: 8px;
		background: #f7faf8;
		padding: 10px;
	}

	.subtable-status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-width: 0;
		text-align: center;
	}

	.subtable-status span,
	.subtable-status strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.subtable-status span {
		color: #23352d;
		font-weight: 850;
	}

	.subtable-status strong {
		border-radius: 999px;
		background: #e7f1ec;
		color: #2f604d;
		padding: 4px 9px;
		font-size: 0.8rem;
	}

	.cache-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}

	.cache-chip {
		display: grid;
		gap: 3px;
		min-width: 0;
		border: 1px solid #dce7e1;
		border-radius: 8px;
		background: #ffffff;
		color: #23352d;
		padding: 9px 10px;
		text-align: left;
	}

	.cache-chip {
		flex: 1 1 150px;
	}

	.cache-chip span,
	.cache-chip small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cache-chip span {
		font-weight: 850;
	}

	.cache-chip small {
		color: #68766f;
		font-weight: 750;
	}

	.cache-chip.active-cache {
		border-color: #6fb892;
		background: #ecf7f2;
	}

	.danger,
	.danger-text {
		color: #923524;
	}

	.selected-total-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-bottom: 14px;
	}

	.selected-total-grid div {
		display: grid;
		gap: 6px;
		border: 1px solid #dce7e1;
		border-radius: 8px;
		background: #f9fbfa;
		padding: 12px;
	}

	.selected-total-grid span {
		color: #65756e;
		font-size: 0.82rem;
		font-weight: 750;
	}

	.selected-total-grid strong {
		color: #173f31;
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}

	.selected-total-grid .negative strong {
		color: #923524;
	}

	.sub-table table {
		min-width: 740px;
	}

	tfoot td {
		border-top: 2px solid #dce7e1;
		background: #f7faf8;
		font-weight: 850;
	}

	.selected-empty {
		border: 1px dashed #cbd8d1;
		border-radius: 8px;
	}

	.dark-mode {
		color: #edf5f0;
	}

	.dark-mode .intro,
	.dark-mode .upload-zone p,
	.dark-mode .mapping-panel__header p,
	.dark-mode .table-toolbar p,
	.dark-mode .empty-state,
	.dark-mode .empty-inline,
	.dark-mode .cache-chip small,
	.dark-mode .summary-card span,
	.dark-mode .selected-total-grid span {
		color: #a9bbb2;
	}

	.dark-mode .privacy-mark,
	.dark-mode .theme-toggle,
	.dark-mode .import-pill,
	.dark-mode .upload-zone,
	.dark-mode .mapping-section,
	.dark-mode .filters,
	.dark-mode .results,
	.dark-mode .mapping-panel,
	.dark-mode .summary-card,
	.dark-mode .selected-total-grid div,
	.dark-mode .subtable-navigator,
	.dark-mode .cache-chip {
		border-color: #245136;
		background: #050806;
		color: #edf5f0;
		box-shadow: 0 18px 48px rgb(0 0 0 / 24%);
	}

	.dark-mode .import-pill {
		border-color: #315842;
		background: #07100b;
		color: #bdf2cf;
	}

	.dark-mode .upload-zone.dragging {
		border-color: #75c69d;
		background: #000000;
	}

	.dark-mode .upload-icon,
	.dark-mode .icon-button,
	.dark-mode .secondary,
	.dark-mode .bank-list span,
	.dark-mode .search-field div,
	.dark-mode .cache-chip.active-cache {
		border-color: #2f7449;
		background: #000000;
		color: #edf5f0;
	}

	.dark-mode .primary {
		background: #79caa2;
		color: #0f1713;
	}

	.dark-mode input,
	.dark-mode select {
		border-color: #3b4e43;
		background: #101a15;
		color: #edf5f0;
	}

	.dark-mode input[type='checkbox'] {
		appearance: none;
		display: inline-grid;
		place-content: center;
		width: 18px;
		height: 18px;
		min-height: 18px;
		padding: 0;
		border: 1px solid #2f7449;
		border-radius: 4px;
		background: #000000;
		accent-color: #36d07f;
	}

	.dark-mode input[type='checkbox']::before {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: #39e58d;
		content: "";
		transform: scale(0);
		transition: transform 120ms ease;
	}

	.dark-mode input[type='checkbox']:checked::before {
		transform: scale(1);
	}

	.dark-mode input::placeholder {
		color: #7f9288;
	}

	.dark-mode .rule-group,
	.dark-mode .selected-panel {
		border-color: #2c3c34;
	}

	.dark-mode .table-wrap {
		border-color: #2c3c34;
		background: #101a15;
	}

	.dark-mode th,
	.dark-mode tfoot td {
		border-color: #2c3c34;
		background: #203027;
		color: #b9c9c1;
	}

	.dark-mode td {
		border-color: #24332b;
	}

	.dark-mode tbody tr:hover {
		background: #16251e;
	}

	.dark-mode tbody tr.selected-row {
		background: #020d07;
	}

	.dark-mode .summary-card strong,
	.dark-mode .selected-total-grid strong,
	.dark-mode .empty-state h2,
	.dark-mode .subtable-status span,
	.dark-mode .cache-chip span {
		color: #f4fbf7;
	}

	.dark-mode .summary-card.net,
	.dark-mode .bank-tag,
	.dark-mode .subtable-status strong {
		border: 1px solid #2f7449;
		background: #000000;
		color: #9ee4bd;
	}

	.dark-mode .summary-card.net.negative {
		background: #000000;
	}

	.dark-mode .row-number-cell {
		color: #7ca18d;
	}

	.dark-mode .income {
		color: #38e58d;
	}

	.dark-mode .expense,
	.dark-mode .danger,
	.dark-mode .danger-text,
	.dark-mode .summary-card.net.negative strong,
	.dark-mode .selected-total-grid .negative strong {
		color: #ff5b57;
	}

	.empty-state,
	.empty-inline {
		display: grid;
		place-items: center;
		text-align: center;
	}

	.empty-state {
		min-height: 360px;
		border: 1px dashed #cbd8d1;
		border-radius: 8px;
		padding: 32px;
		color: #627269;
	}

	.empty-state h2 {
		margin: 14px 0 6px;
		color: #26332d;
	}

	.empty-state p {
		max-width: 520px;
		margin-bottom: 0;
		line-height: 1.55;
	}

	.empty-inline {
		min-height: 150px;
		color: #68766f;
	}

	@media (max-width: 980px) {
		.app-shell {
			padding: 20px;
		}

		.topbar,
		.upload-zone,
		.workspace {
			grid-template-columns: 1fr;
		}

		.privacy-mark,
		.upload-zone .button {
			width: fit-content;
		}

		.filters {
			position: static;
		}
	}

	@media (max-width: 680px) {
		.app-shell {
			padding: 14px;
		}

		.summary-grid,
		.mapping-fields {
			grid-template-columns: 1fr;
		}

		.table-toolbar,
		.filter-actions {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.table-toolbar {
			display: grid;
		}

		.table-toolbar .button,
		.toolbar-actions,
		.filter-actions .button {
			width: 100%;
		}

		.toolbar-actions {
			display: grid;
		}

		.selected-total-grid {
			grid-template-columns: 1fr;
		}

		.subtable-status {
			display: grid;
			gap: 4px;
		}
	}
</style>
