import { fetchWiborRates } from './wiborService.js';
import { generateMortgageSchedules, calculateMonthsFromEndDate } from './calculator.js';
import { renderMortgageCharts } from './chartRenderer.js';
import { 
    formatPLN, 
    formatPolishMonth, 
    formatPolishDateLong, 
    renderScheduleTable, 
    initTooltips, 
    showToast 
} from './domHelpers.js';

// Application State
const state = {
    fetchedWibor: null, // Stores rates from GPW Benchmark
    customOverpayments: [], // Array of { monthIndex: number, amount: number }
    currentPage: 1,
    pageSize: 10,
    activeCalculation: null // Stores latest output from generator
};

// DOM Elements
const els = {
    principalInput: document.getElementById('principal'),
    marginInput: document.getElementById('margin'),
    wiborInput: document.getElementById('wibor-value'),
    wiborTermSelector: document.getElementById('wibor-term-selector'),
    wiborStatusDot: document.getElementById('wibor-status-dot'),
    wiborStatusText: document.getElementById('wibor-status-text'),
    
    // Duration
    startMonthInput: document.getElementById('start-month'),
    durationModeSelect: document.getElementById('duration-mode'),
    monthsInputGroup: document.getElementById('months-input-group'),
    endDateInputGroup: document.getElementById('end-date-input-group'),
    monthsInput: document.getElementById('months-remaining'),
    endDateInput: document.getElementById('end-date'),
    
    // Overpayment Inputs
    overpaymentBaseInput: document.getElementById('overpayment-base'),
    overpaymentImpactDuration: document.getElementById('impact-duration'),
    overpaymentImpactInstalment: document.getElementById('impact-instalment'),
    segmentedRecurrenceBase: document.getElementById('recurrence-monthly'),
    segmentedRecurrenceSingle: document.getElementById('recurrence-single'),
    btnMinusOverpayment: document.getElementById('btn-minus-overpayment'),
    btnPlusOverpayment: document.getElementById('btn-plus-overpayment'),
    btnResetForm: document.getElementById('btn-reset-form'),
    btnAddCustomOverpayment: document.getElementById('btn-add-custom-overpayment'),
    customOverpaymentsList: document.getElementById('custom-overpayments-list'),
    
    // KPI Outputs
    kpiTotalToPay: document.getElementById('kpi-total-to-pay'),
    kpiCapitalPart: document.getElementById('kpi-capital-part'),
    kpiInterestPart: document.getElementById('kpi-interest-part'),
    kpiSavingsAmount: document.getElementById('kpi-savings-amount'),
    kpiSavingsPercent: document.getElementById('kpi-savings-percent'),
    kpiEndDate: document.getElementById('kpi-end-date'),
    kpiRemainingMonths: document.getElementById('kpi-remaining-months'),
    kpiRemainingYearsText: document.getElementById('kpi-remaining-years-text'),
    kpiOverpaymentsSum: document.getElementById('kpi-overpayments-sum'),
    kpiMonthsSaved: document.getElementById('kpi-months-saved'),
    
    // Progress Bar
    barCapital: document.getElementById('bar-capital'),
    barInterest: document.getElementById('bar-interest'),
    barCapitalPct: document.getElementById('bar-capital-pct'),
    barInterestPct: document.getElementById('bar-interest-pct'),
    
    // Next Instalment
    nextInstalmentVal: document.getElementById('next-instalment-val'),
    nextInstalmentDate: document.getElementById('next-instalment-date'),
    nextInstalmentOverpayment: document.getElementById('next-instalment-overpayment'),
    
    // Charts
    costCanvas: document.getElementById('chart-yearly-cost'),
    balanceCanvas: document.getElementById('chart-loan-balance'),
    
    // Amortization Table
    tableBody: document.getElementById('schedule-table-body'),
    pageSizeSelect: document.getElementById('page-size-select'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),
    pageInfoText: document.getElementById('page-info-text'),
    
    // Modal
    modalOverlay: document.getElementById('modal-overpayment'),
    modalTitle: document.getElementById('modal-title'),
    modalMonthInput: document.getElementById('modal-month'),
    modalAmountInput: document.getElementById('modal-amount'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSubmit: document.getElementById('modal-submit'),
    
    // Export
    btnExportCsv: document.getElementById('btn-export-csv'),
    warningBox: document.getElementById('calculator-placeholder-warning'),
    warningList: document.getElementById('warning-missing-list'),
    resultsWrapper: document.getElementById('calculator-results-wrapper')
};

// INITIALIZATION
window.addEventListener('DOMContentLoaded', async () => {
    // Set default values matching user's screenshot
    setDefaultValues();
    
    // Set up all listeners
    setupEventListeners();
    
    // Fetch WIBOR rates from GPW Benchmark
    await handleWiborFetch();
    
    // Initial run
    recalculate();
    
    // Initalize tooltips
    initTooltips();
});

function setDefaultValues() {
    els.principalInput.value = '';
    els.marginInput.value = '';
    els.wiborInput.value = '';
    
    // Remove active class from all wibor selector buttons initially
    els.wiborTermSelector.querySelectorAll('.wibor-btn').forEach(b => b.classList.remove('active'));
    
    els.startMonthInput.value = '2026-06';
    els.durationModeSelect.value = 'months';
    els.monthsInput.value = '';
    els.endDateInput.value = '';
    els.overpaymentBaseInput.value = '';
    els.overpaymentImpactDuration.checked = true;
    els.overpaymentImpactInstalment.checked = false;
    els.segmentedRecurrenceBase.classList.add('active');
    els.segmentedRecurrenceSingle.classList.remove('active');
}

async function handleWiborFetch() {
    els.wiborStatusDot.className = 'wibor-status-dot loading';
    els.wiborStatusText.innerText = 'Pobieranie stawek WIBOR...';
    
    const result = await fetchWiborRates();
    state.fetchedWibor = result.rates;
    
    els.wiborStatusDot.className = `wibor-status-dot ${result.success ? 'success' : 'fallback'}`;
    els.wiborStatusText.innerHTML = `WIBOR 3M: <strong>${state.fetchedWibor['3M'].value.toFixed(2)}%</strong> (${result.rates['3M'].isFallback ? 'zapasowe z 22.05.26' : 'aktualne z gpw'})`;
    
    if (result.success) {
        showToast(result.message, 'success');
    } else {
        showToast(result.message, 'warning');
    }
    
    // We do NOT auto-populate els.wiborInput.value at startup to keep it empty.
    // The user can click '1M', '3M', '6M' buttons to load them, or click 'Własny' to type.
}

function setupEventListeners() {
    // Form Inputs Trigger Recalculate
    const inputsToTrigger = [
        els.principalInput, els.marginInput, els.wiborInput, 
        els.startMonthInput, els.monthsInput, els.endDateInput,
        els.overpaymentBaseInput
    ];
    
    inputsToTrigger.forEach(el => {
        el.addEventListener('input', () => {
            // When target end date changes in 'date' mode, calculate months remaining
            if (el === els.endDateInput && els.durationModeSelect.value === 'date') {
                const calculatedMonths = calculateMonthsFromEndDate(els.endDateInput.value, els.startMonthInput.value);
                els.monthsInput.value = calculatedMonths;
            }
            // When months change in 'months' mode, update target date
            if (el === els.monthsInput && els.durationModeSelect.value === 'months') {
                updateEndDateFromMonths();
            }
            // When start month changes, recalculate date relationships
            if (el === els.startMonthInput) {
                if (els.durationModeSelect.value === 'date') {
                    const calculatedMonths = calculateMonthsFromEndDate(els.endDateInput.value, els.startMonthInput.value);
                    els.monthsInput.value = calculatedMonths;
                } else {
                    updateEndDateFromMonths();
                }
            }
            recalculate();
        });
    });
    
    // WIBOR Term Buttons
    els.wiborTermSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.wibor-btn');
        if (!btn) return;
        
        // Remove active class
        els.wiborTermSelector.querySelectorAll('.wibor-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const term = btn.getAttribute('data-term');
        if (term === 'custom') {
            els.wiborInput.removeAttribute('readonly');
            els.wiborInput.focus();
        } else {
            els.wiborInput.setAttribute('readonly', 'true');
            if (state.fetchedWibor && state.fetchedWibor[term]) {
                els.wiborInput.value = state.fetchedWibor[term].value.toFixed(2);
                showToast(`Ustawiono WIBOR ${term}: ${state.fetchedWibor[term].value}%`, 'success');
                recalculate();
            }
        }
    });

    // Duration Mode Switcher
    els.durationModeSelect.addEventListener('change', () => {
        const mode = els.durationModeSelect.value;
        if (mode === 'months') {
            els.monthsInputGroup.style.display = 'block';
            els.endDateInputGroup.style.display = 'none';
        } else {
            els.monthsInputGroup.style.display = 'none';
            els.endDateInputGroup.style.display = 'block';
            // Calculate months based on the date input
            const calculatedMonths = calculateMonthsFromEndDate(els.endDateInput.value, els.startMonthInput.value);
            els.monthsInput.value = calculatedMonths;
            recalculate();
        }
    });

    // Overpayment Spinners (+ / -)
    els.btnMinusOverpayment.addEventListener('click', () => {
        let val = Math.max(0, parseFloat(els.overpaymentBaseInput.value) || 0);
        val = Math.max(0, val - 100);
        els.overpaymentBaseInput.value = val;
        recalculate();
    });

    els.btnPlusOverpayment.addEventListener('click', () => {
        let val = Math.max(0, parseFloat(els.overpaymentBaseInput.value) || 0);
        val += 100;
        els.overpaymentBaseInput.value = val;
        recalculate();
    });

    // Mutually Exclusive Overpayment Impact Toggles (Reduces Instalment vs Reduces Term)
    els.overpaymentImpactDuration.addEventListener('change', () => {
        if (els.overpaymentImpactDuration.checked) {
            els.overpaymentImpactInstalment.checked = false;
            recalculate();
        }
    });
    
    els.overpaymentImpactInstalment.addEventListener('change', () => {
        if (els.overpaymentImpactInstalment.checked) {
            els.overpaymentImpactDuration.checked = false;
            recalculate();
        }
    });

    // Segmented control toggle for Overpayment type (Monthly vs Single)
    // Monthly sets the regular base monthly overpayment.
    // Single overrides base overpayment to 0 and lets user build a customized schedule.
    els.segmentedRecurrenceBase.addEventListener('click', () => {
        els.segmentedRecurrenceBase.classList.add('active');
        els.segmentedRecurrenceSingle.classList.remove('active');
        els.overpaymentBaseInput.removeAttribute('disabled');
        // Restore standard overpayment if it was 0
        if (els.overpaymentBaseInput.value === '0') {
            els.overpaymentBaseInput.value = '2000';
        }
        recalculate();
    });

    els.segmentedRecurrenceSingle.addEventListener('click', () => {
        els.segmentedRecurrenceSingle.classList.add('active');
        els.segmentedRecurrenceBase.classList.remove('active');
        // When 'single' is selected, base monthly overpayment is 0, user enters everything manually
        els.overpaymentBaseInput.value = '0';
        els.overpaymentBaseInput.setAttribute('disabled', 'true');
        recalculate();
        showToast('Wybierz wiersz w tabeli na dole, aby dodać nadpłatę w konkretnym miesiącu.', 'warning');
    });

    // Add custom overpayment button
    els.btnAddCustomOverpayment.addEventListener('click', () => {
        openModalForMonth(1, 1000);
    });

    // Reset Form
    els.btnResetForm.addEventListener('click', () => {
        setDefaultValues();
        state.customOverpayments = [];
        renderCustomOverpaymentsList();
        state.currentPage = 1;
        recalculate();
        showToast('Formularz został zresetowany do wartości domyślnych.', 'warning');
    });

    // Pagination
    els.pageSizeSelect.addEventListener('change', () => {
        state.pageSize = parseInt(els.pageSizeSelect.value) || 12;
        state.currentPage = 1;
        updateTableOnly();
    });

    els.btnPrevPage.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            updateTableOnly();
        }
    });

    els.btnNextPage.addEventListener('click', () => {
        const maxPages = Math.ceil(state.activeCalculation.overpaid.schedule.length / state.pageSize);
        if (state.currentPage < maxPages) {
            state.currentPage++;
            updateTableOnly();
        }
    });

    // Modal Events
    els.modalClose.addEventListener('click', closeModal);
    els.modalCancel.addEventListener('click', closeModal);
    els.modalSubmit.addEventListener('click', saveModalOverpayment);
    els.modalOverlay.addEventListener('click', (e) => {
        if (e.target === els.modalOverlay) closeModal();
    });

    // Export CSV
    els.btnExportCsv.addEventListener('click', exportScheduleToCsv);
}

function updateEndDateFromMonths() {
    const months = parseInt(els.monthsInput.value) || 240;
    const [startYear, startMonth] = els.startMonthInput.value.split('-').map(Number);
    
    // First payment is Month 0. Last payment is Month (months - 1).
    const totalMonths = (startMonth - 1) + (months - 1);
    const endYear = startYear + Math.floor(totalMonths / 12);
    const endMonthVal = (totalMonths % 12) + 1;
    
    els.endDateInput.value = `${endYear}-${String(endMonthVal).padStart(2, '0')}`;
}

// MAIN CALCULATOR RUNNER
function recalculate() {
    // 1. Gather missing / invalid inputs
    const missing = [];
    
    const principal = parseFloat(els.principalInput.value);
    if (!els.principalInput.value || isNaN(principal) || principal <= 0) {
        missing.push("Kapitał pozostały do spłaty (musi być większy niż 0 PLN)");
    }
    
    const margin = parseFloat(els.marginInput.value);
    if (!els.marginInput.value || isNaN(margin) || margin < 0) {
        missing.push("Marża banku (np. 2,35 %)");
    }
    
    const wibor = parseFloat(els.wiborInput.value);
    if (!els.wiborInput.value || isNaN(wibor) || wibor < 0) {
        missing.push("Stawka WIBOR (wybierz okres 1M/3M/6M lub wpisz własną)");
    }
    
    const isMonthsMode = els.durationModeSelect.value === 'months';
    let monthsRemaining = 0;
    if (isMonthsMode) {
        monthsRemaining = parseInt(els.monthsInput.value);
        if (!els.monthsInput.value || isNaN(monthsRemaining) || monthsRemaining <= 0) {
            missing.push("Liczba pozostałych rat (musi być większa niż 0)");
        }
    } else {
        if (!els.endDateInput.value) {
            missing.push("Miesiąc ostatniej raty (czas trwania kredytu)");
        } else {
            monthsRemaining = calculateMonthsFromEndDate(els.endDateInput.value, els.startMonthInput.value);
        }
    }
    
    if (!els.startMonthInput.value) {
        missing.push("Miesiąc pierwszej raty symulacji");
    }

    // 2. Update UI based on validation results
    if (missing.length > 0) {
        els.warningList.innerHTML = '';
        missing.forEach(field => {
            const li = document.createElement('li');
            li.innerHTML = `Uzupełnij pole: <strong>${field}</strong>`;
            els.warningList.appendChild(li);
        });
        els.warningBox.style.display = 'block';
        els.resultsWrapper.style.display = 'none';
        return;
    }

    // Input data is fully valid: hide warning and show results
    els.warningBox.style.display = 'none';
    els.resultsWrapper.style.display = 'flex';

    // Proceed with calculation
    const startMonthYear = els.startMonthInput.value;
    const monthlyOverpayment = parseFloat(els.overpaymentBaseInput.value) || 0; // Empty overpayment defaults to 0
    const overpaymentImpact = els.overpaymentImpactDuration.checked ? 'reduce_duration' : 'reduce_instalment';

    const calculation = generateMortgageSchedules({
        principal,
        wibor,
        margin,
        monthsRemaining,
        startMonthYear,
        monthlyOverpayment,
        overpaymentImpact,
        customOverpayments: state.customOverpayments
    });

    state.activeCalculation = calculation;
    updateDashboardUI(calculation);
    renderMortgageCharts(els.costCanvas, els.balanceCanvas, calculation);
    updateTableOnly();
}

function updateDashboardUI(calc) {
    const over = calc.overpaid;
    const savings = calc.savings;
    const std = calc.standard;

    // Do spłaty total cost
    els.kpiTotalToPay.innerText = formatPLN(over.totalCost);
    
    // Capital & Interest progress bar
    const capPct = over.totalCost > 0 ? (over.totalCapital / over.totalCost) * 100 : 0;
    const intPct = over.totalCost > 0 ? (over.totalInterest / over.totalCost) * 100 : 0;
    
    els.barCapital.style.width = `${capPct}%`;
    els.barInterest.style.width = `${intPct}%`;
    els.barCapitalPct.innerText = `${capPct.toFixed(2)}%`;
    els.barInterestPct.innerText = `${intPct.toFixed(2)}%`;
    
    els.kpiCapitalPart.innerText = formatPLN(over.totalCapital);
    els.kpiInterestPart.innerText = formatPLN(over.totalInterest);

    // End date badge / Z nadpłatami details
    els.kpiEndDate.innerText = formatPolishMonth(over.lastPaymentDate);
    
    // Remaining payments details
    const yrs = Math.floor(over.duration / 12);
    const mths = over.duration % 12;
    els.kpiRemainingMonths.innerText = over.duration;
    els.kpiRemainingYearsText.innerText = `(${yrs} lat, ${mths} miesięcy)`;
    
    // Total savings
    els.kpiSavingsAmount.innerText = formatPLN(savings.interest);
    els.kpiSavingsPercent.innerText = `${savings.percent.toFixed(2)}%`;
    
    // Sum of overpayments
    els.kpiOverpaymentsSum.innerText = formatPLN(over.totalOverpayments);
    
    // Months saved (X rat mniej)
    els.kpiMonthsSaved.innerText = savings.months;

    // Display sub-badge "Nadpłacając X PLN"
    const subtext = document.querySelector('.ratio-title-wrap .ratio-sub');
    if (subtext) {
        if (over.totalOverpayments > 0) {
            const avgOverpayment = parseFloat(els.overpaymentBaseInput.value) || 0;
            subtext.innerText = avgOverpayment > 0 
                ? `Nadpłacając ${formatPLN(avgOverpayment)} miesięcznie` 
                : 'Z nadpłatami jednorazowymi';
        } else {
            subtext.innerText = 'Bez dodatkowych nadpłat';
        }
    }

    // Update Next Instalment Panel (Rata za czerwiec 2026 itp.)
    if (over.schedule.length > 0) {
        const nextInstalment = over.schedule[0];
        els.nextInstalmentVal.innerText = formatPLN(nextInstalment.instalment);
        
        const firstDate = nextInstalment.date;
        els.nextInstalmentDate.innerText = `Rata za ${formatPolishMonth(firstDate)}`;
        
        // Show overpayment added to next instalment
        if (nextInstalment.overpayment > 0) {
            els.nextInstalmentOverpayment.innerText = `+ ${formatPLN(nextInstalment.overpayment)} nadpłaty`;
            els.nextInstalmentOverpayment.style.display = 'block';
        } else {
            els.nextInstalmentOverpayment.style.display = 'none';
        }
    } else {
        els.nextInstalmentVal.innerText = '0,00 PLN';
        els.nextInstalmentDate.innerText = 'Brak rat';
        els.nextInstalmentOverpayment.style.display = 'none';
    }
}

function updateTableOnly() {
    const calc = state.activeCalculation;
    if (!calc) return;
    
    const over = calc.overpaid;
    
    // Prepare table footer sums object
    const totalSums = {
        duration: over.duration,
        totalCapital: over.totalCapital,
        totalInterest: over.totalInterest,
        totalInstalments: over.totalCapital + over.totalInterest,
        totalOverpayments: over.totalOverpayments,
        totalCost: over.totalCost
    };

    // Render table rows
    renderScheduleTable(
        els.tableBody, 
        over.schedule, 
        state.currentPage, 
        state.pageSize, 
        totalSums,
        (nr, currentOverpayment) => {
            // Triggered when clicking an overpayment cell
            openModalForMonth(nr, currentOverpayment);
        }
    );

    // Update pagination indicators
    const maxPages = Math.ceil(over.schedule.length / state.pageSize);
    
    els.btnPrevPage.disabled = state.currentPage === 1;
    els.btnNextPage.disabled = state.currentPage >= maxPages || maxPages === 0;
    
    const startRange = over.schedule.length > 0 ? (state.currentPage - 1) * state.pageSize + 1 : 0;
    const endRange = Math.min(state.currentPage * state.pageSize, over.schedule.length);
    els.pageInfoText.innerText = `${startRange}-${endRange} z ${over.schedule.length}`;
}

// CUSTOM OVERPAYMENTS SCHEDULER (MODAL)
function openModalForMonth(monthIndex, currentAmount) {
    els.modalMonthInput.value = monthIndex;
    
    // Look up if this month already has a custom overpayment in state
    const existing = state.customOverpayments.find(co => co.monthIndex === monthIndex);
    els.modalAmountInput.value = existing ? existing.amount : (currentAmount > 0 ? currentAmount : 5000);
    
    els.modalTitle.innerText = `Nadpłata w miesiącu ${monthIndex}`;
    
    els.modalOverlay.classList.add('active');
    els.modalAmountInput.focus();
    els.modalAmountInput.select();
}

function closeModal() {
    els.modalOverlay.classList.remove('active');
}

function saveModalOverpayment() {
    const monthIndex = parseInt(els.modalMonthInput.value) || 1;
    const amount = parseFloat(els.modalAmountInput.value) || 0;
    
    // Remove if it exists
    state.customOverpayments = state.customOverpayments.filter(co => co.monthIndex !== monthIndex);
    
    // Add new value if > 0
    if (amount > 0) {
        state.customOverpayments.push({ monthIndex, amount });
        // Sort by monthIndex ascending
        state.customOverpayments.sort((a, b) => a.monthIndex - b.monthIndex);
        showToast(`Dodano nadpłatę jednorazową ${formatPLN(amount)} w ratacie nr ${monthIndex}`, 'success');
    } else {
        showToast(`Usunięto nadpłatę jednorazową dla raty nr ${monthIndex}`, 'warning');
    }
    
    closeModal();
    renderCustomOverpaymentsList();
    recalculate();
}

function renderCustomOverpaymentsList() {
    els.customOverpaymentsList.innerHTML = '';
    
    if (state.customOverpayments.length === 0) {
        els.customOverpaymentsList.innerHTML = '<div style="font-size: 0.75rem; color: var(--color-text-light); text-align: center; padding: 0.5rem 0;">Brak harmonogramu nadpłat jednorazowych</div>';
        return;
    }

    state.customOverpayments.forEach(co => {
        const item = document.createElement('div');
        item.className = 'custom-overpayment-item';
        item.innerHTML = `
            <span>Rata nr <strong>${co.monthIndex}</strong>:</span>
            <span class="custom-overpayment-item-details">${formatPLN(co.amount)}</span>
            <button class="custom-overpayment-item-remove" data-nr="${co.monthIndex}">&times;</button>
        `;
        
        // Remove handler
        item.querySelector('.custom-overpayment-item-remove').addEventListener('click', (e) => {
            const nr = parseInt(e.target.getAttribute('data-nr'));
            state.customOverpayments = state.customOverpayments.filter(x => x.monthIndex !== nr);
            renderCustomOverpaymentsList();
            recalculate();
            showToast(`Usunięto nadpłatę jednorazową w racie nr ${nr}`, 'warning');
        });
        
        els.customOverpaymentsList.appendChild(item);
    });
}

// EXPORT TO CSV
function exportScheduleToCsv() {
    const calc = state.activeCalculation;
    if (!calc || !calc.overpaid.schedule.length) {
        showToast('Brak danych do wyeksportowania.', 'warning');
        return;
    }
    
    const schedule = calc.overpaid.schedule;
    
    // Polish CSV header structure
    let csvContent = 'Nr;Miesiąc;Kapitał (instalment);Odsetki;Rata;Nadpłata;Suma kosztów;Pozostały Kapitał\r\n';
    
    schedule.forEach(row => {
        const formatExcelNum = (num) => String(num.toFixed(2)).replace('.', ',');
        
        const line = [
            row.nr,
            row.monthLabel,
            formatExcelNum(row.capitalPaid),
            formatExcelNum(row.interestPaid),
            formatExcelNum(row.instalment),
            formatExcelNum(row.overpayment),
            formatExcelNum(row.totalCost),
            formatExcelNum(row.balance)
        ].join(';');
        
        csvContent += line + '\r\n';
    });
    
    // Add summary row
    const over = calc.overpaid;
    const formatExcelNum = (num) => String(num.toFixed(2)).replace('.', ',');
    const summaryLine = [
        'Suma',
        over.duration,
        formatExcelNum(over.totalCapital),
        formatExcelNum(over.totalInterest),
        formatExcelNum(over.totalCapital + over.totalInterest),
        formatExcelNum(over.totalOverpayments),
        formatExcelNum(over.totalCost),
        '0,00'
    ].join(';');
    csvContent += summaryLine + '\r\n';

    // UTF-8 BOM for correct Excel encoding of Polish characters
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `harmonogram_kredytu_nadplaty_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Wyeksportowano harmonogram do pliku CSV.', 'success');
}
