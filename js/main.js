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
    btnExportWord: document.getElementById('btn-export-word'),
    btnExportWordTop: document.getElementById('btn-export-word-top'),
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
    if (els.btnExportWord) {
        els.btnExportWord.addEventListener('click', exportScheduleToWord);
    }
    if (els.btnExportWordTop) {
        els.btnExportWordTop.addEventListener('click', exportScheduleToWord);
    }
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

function getCanvasPngBase64(canvasElement) {
    if (!canvasElement) return '';
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasElement.width;
        tempCanvas.height = canvasElement.height;
        const ctx = tempCanvas.getContext('2d');
        
        // Fill with white background to prevent transparent chart issues in MS Word
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw the chart canvas on top
        ctx.drawImage(canvasElement, 0, 0);
        
        // Get base64 string
        const dataUrl = tempCanvas.toDataURL('image/png');
        // Extract base64 part
        return dataUrl.split(',')[1];
    } catch (e) {
        console.error('Error extracting canvas image:', e);
        return '';
    }
}

function exportScheduleToWord() {
    const calc = state.activeCalculation;
    if (!calc || !calc.overpaid.schedule.length) {
        showToast('Brak danych do wyeksportowania.', 'warning');
        return;
    }
    
    const std = calc.standard;
    const over = calc.overpaid;
    const savings = calc.savings;
    
    // Retrieve values from inputs
    const principal = parseFloat(els.principalInput.value) || 0;
    const margin = parseFloat(els.marginInput.value) || 0;
    const wibor = parseFloat(els.wiborInput.value) || 0;
    const fixedRate = els.fixedRateInput ? parseFloat(els.fixedRateInput.value) : 0;
    const monthsRemaining = parseInt(els.monthsInput.value) || 0;
    const monthlyOverpayment = parseFloat(els.overpaymentBaseInput.value) || 0;
    const overpaymentImpact = els.overpaymentImpactDuration.checked ? 'reduce_duration' : 'reduce_instalment';
    
    const interestTypeLabel = state.interestType === 'fixed' ? 'Stałe' : 'Zmienne';
    const rate = state.interestType === 'fixed' ? fixedRate : (margin + wibor);
    
    const activeWiborBtn = els.wiborTermSelector.querySelector('.wibor-btn.active');
    const wiborTerm = activeWiborBtn ? activeWiborBtn.getAttribute('data-term') : '3M';
    const wiborTermLabel = state.interestType === 'fixed' ? 'Stała stopa bazowa' : `WIBOR ${wiborTerm}`;
    
    // Generation timestamp
    const generationDate = new Date().toLocaleString('pl-PL');
    
    // Overpayment text
    const recurrenceType = els.segmentedRecurrenceBase.classList.contains('active') ? 'monthly' : 'single';
    let overpaymentText = '';
    if (recurrenceType === 'single') {
        overpaymentText = `Tylko nadpłaty jednorazowe (${state.customOverpayments.length} szt.)`;
    } else {
        if (monthlyOverpayment > 0) {
            const strategyText = overpaymentImpact === 'reduce_duration' ? 'skracanie okresu spłaty' : 'obniżanie raty';
            overpaymentText = `Miesięcznie ${formatPLN(monthlyOverpayment)} (${strategyText})`;
            if (state.customOverpayments.length > 0) {
                overpaymentText += ` + ${state.customOverpayments.length} nadpłat jednorazowych`;
            }
        } else {
            overpaymentText = 'Brak (harmonogram standardowy)';
        }
    }
    
    // Strategy description
    const strategyDescription = overpaymentImpact === 'reduce_duration' 
        ? 'Zmniejszenie liczby rat (skrócenie czasu spłaty przy zachowaniu wysokości raty)' 
        : 'Obniżenie wysokości raty (przy zachowaniu pierwotnego czasu trwania kredytu)';
        
    // Standard End Date Label
    const stdEndDateLabel = std.schedule.length > 0 
        ? formatPolishMonth(std.schedule[std.schedule.length - 1].date)
        : 'Brak';
    
    // Overpaid End Date Label
    const overEndDateLabel = over.schedule.length > 0
        ? formatPolishMonth(over.schedule[over.schedule.length - 1].date)
        : 'Brak';
        
    // First 12 months preview rows
    let scheduleRowsHtml = '';
    const previewLimit = Math.min(12, over.schedule.length);
    const previewSums = { capital: 0, interest: 0, instalment: 0, overpayment: 0, totalCost: 0 };
    
    for (let i = 0; i < previewLimit; i++) {
        const row = over.schedule[i];
        previewSums.capital += row.capitalPaid;
        previewSums.interest += row.interestPaid;
        previewSums.instalment += row.instalment;
        previewSums.overpayment += row.overpayment;
        previewSums.totalCost += row.totalCost;
        
        scheduleRowsHtml += `
            <tr>
                <td style="text-align: center;">${row.nr}</td>
                <td>${row.monthLabel}</td>
                <td>${formatPLN(row.capitalPaid)}</td>
                <td>${formatPLN(row.interestPaid)}</td>
                <td>${formatPLN(row.instalment)}</td>
                <td style="${row.overpayment > 0 ? 'color: #047857; font-weight: bold;' : ''}">${row.overpayment > 0 ? formatPLN(row.overpayment) : '0,00 PLN'}</td>
                <td><strong>${formatPLN(row.totalCost)}</strong></td>
            </tr>
        `;
    }
    
    // Extract base64 images from canvas
    const yearlyCostChartBase64 = getCanvasPngBase64(els.costCanvas);
    const loanBalanceChartBase64 = getCanvasPngBase64(els.balanceCanvas);
    
    // Generate the HTML template for the Word doc
    const htmlTemplate = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Raport Kredytowy - Symulacja Nadpłat</title>
<style>
    body {
        font-family: 'Calibri', 'Segoe UI', 'Arial', sans-serif;
        color: #1E293B;
        line-height: 1.5;
        margin: 0;
        padding: 0;
    }
    .cover-page {
        padding: 30px;
        text-align: center;
        background-color: #F8FAFC;
        border-bottom: 3px solid #2563EB;
        margin-bottom: 20px;
    }
    .cover-title {
        font-size: 24pt;
        color: #0F172A;
        font-weight: bold;
        margin-top: 30px;
        margin-bottom: 10px;
        text-transform: uppercase;
    }
    .cover-subtitle {
        font-size: 13pt;
        color: #475569;
        margin-bottom: 30px;
    }
    .meta-table {
        margin: 0 auto;
        border-collapse: collapse;
        width: 90%;
        margin-top: 20px;
        margin-bottom: 30px;
    }
    .meta-table td {
        padding: 8px 10px;
        border-bottom: 1px solid #E2E8F0;
        font-size: 10.5pt;
        text-align: left;
    }
    .meta-label {
        font-weight: bold;
        color: #475569;
        width: 40%;
    }
    .meta-value {
        color: #0F172A;
    }
    .section-title {
        font-size: 15pt;
        color: #1E293B;
        border-bottom: 2px solid #E2E8F0;
        padding-bottom: 5px;
        margin-top: 25px;
        margin-bottom: 12px;
        font-weight: bold;
    }
    .kpi-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
        margin-bottom: 20px;
    }
    .kpi-cell {
        width: 50%;
        padding: 5px;
    }
    .kpi-card {
        background-color: #F8FAFC;
        border: 1px solid #E2E8F0;
        padding: 12px;
        text-align: center;
    }
    .kpi-card.savings {
        background-color: #ECFDF5;
        border: 1px solid #A7F3D0;
    }
    .kpi-card.term {
        background-color: #EFF6FF;
        border: 1px solid #BFDBFE;
    }
    .kpi-value {
        font-size: 16pt;
        font-weight: bold;
        color: #0F172A;
        margin: 3px 0;
    }
    .kpi-card.savings .kpi-value {
        color: #047857;
    }
    .kpi-card.term .kpi-value {
        color: #1D4ED8;
    }
    .kpi-label {
        font-size: 8.5pt;
        color: #475569;
        text-transform: uppercase;
        font-weight: bold;
    }
    .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 9.5pt;
    }
    .data-table th {
        background-color: #1E293B;
        color: #FFFFFF;
        padding: 8px 10px;
        text-align: left;
        font-weight: bold;
        border: 1px solid #1E293B;
    }
    .data-table td {
        padding: 6px 8px;
        border: 1px solid #E2E8F0;
    }
    .data-table tr:nth-child(even) {
        background-color: #F8FAFC;
    }
    .data-table .sum-row {
        font-weight: bold;
        background-color: #F1F5F9 !important;
        border-top: 2px solid #94A3B8;
    }
    .text-success {
        color: #059669;
        font-weight: bold;
    }
    .text-danger {
        color: #DC2626;
    }
    .text-primary {
        color: #2563EB;
        font-weight: bold;
    }
    .chart-box {
        text-align: center;
        margin: 15px 0;
        padding: 10px;
        border: 1px solid #E2E8F0;
        background-color: #FFFFFF;
    }
    .chart-image {
        width: 580px;
        height: auto;
    }
    .page-break {
        page-break-before: always;
    }
</style>
</head>
<body>
    <div class="cover-page">
        <div style="font-size: 10.5pt; color: #2563EB; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">Kalkulator Kredytu Hipotecznego</div>
        <div class="cover-title">Raport Symulacji Spłaty Kredytu</div>
        <div class="cover-subtitle">Zestawienie korzyści finansowych z nadpłat kapitału</div>
        
        <table class="meta-table">
            <tr>
                <td class="meta-label">Data wygenerowania:</td>
                <td class="meta-value">${generationDate}</td>
            </tr>
            <tr>
                <td class="meta-label">Kapitał pozostały do spłaty:</td>
                <td class="meta-value">${formatPLN(principal)}</td>
            </tr>
            <tr>
                <td class="meta-label">Rodzaj oprocentowania:</td>
                <td class="meta-value">${interestTypeLabel}</td>
            </tr>
            <tr>
                <td class="meta-label">Aktualne oprocentowanie:</td>
                <td class="meta-value">${rate.toFixed(2)} % (${state.interestType === 'fixed' ? 'stała stopa' : `marża ${margin.toFixed(2)}% + ${wiborTermLabel} ${wibor.toFixed(2)}%`})</td>
            </tr>
            <tr>
                <td class="meta-label">Pozostały okres (bez nadpłat):</td>
                <td class="meta-value">${monthsRemaining} rat (${Math.floor(monthsRemaining/12)} lat, ${monthsRemaining%12} mies.)</td>
            </tr>
            <tr>
                <td class="meta-label">Deklarowane nadpłaty:</td>
                <td class="meta-value">${overpaymentText}</td>
            </tr>
        </table>
        
        <div style="margin-top: 30px; font-size: 9.5pt; color: #64748B; line-height: 1.4;">
            Dokument wygenerowany na potrzeby analizy własnej oraz prezentacji w banku lub u doradcy finansowego.<br>
            Przedstawione wyliczenia mają charakter symulacyjny i opierają się na aktualnych danych rynkowych.
        </div>
    </div>
    
    <div class="page-break"></div>
    
    <div class="section-title">1. Porównanie Wariantów Spłaty</div>
    <p style="font-size: 10pt; margin-bottom: 15px;">Zestawienie kosztów kredytu w wersji standardowej (bez nadpłat) oraz przy realizacji planowanych nadpłat.</p>
    
    <table class="data-table">
        <thead>
            <tr>
                <th>Parametr porównawczy</th>
                <th>Kredyt Standardowy</th>
                <th>Kredyt z Nadpłatami</th>
                <th>Różnica (Oszczędność)</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>Suma spłaconego kapitału</strong></td>
                <td>${formatPLN(std.totalCapital)}</td>
                <td>${formatPLN(over.totalCapital)}</td>
                <td>0,00 PLN</td>
            </tr>
            <tr>
                <td><strong>Suma zapłaconych odsetek</strong></td>
                <td class="text-danger">${formatPLN(std.totalInterest)}</td>
                <td class="text-danger">${formatPLN(over.totalInterest)}</td>
                <td class="text-success">${formatPLN(savings.interest)}</td>
            </tr>
            <tr>
                <td><strong>Całkowity koszt spłaty</strong></td>
                <td>${formatPLN(std.totalCost)}</td>
                <td>${formatPLN(over.totalCost)}</td>
                <td class="text-success">${formatPLN(savings.interest)}</td>
            </tr>
            <tr>
                <td><strong>Rzeczywista liczba rat (okres spłaty)</strong></td>
                <td>${std.duration} rat (${Math.floor(std.duration/12)} lat, ${std.duration%12} mies.)</td>
                <td class="text-primary">${over.duration} rat (${Math.floor(over.duration/12)} lat, ${over.duration%12} mies.)</td>
                <td class="text-success">Skrócenie o ${savings.months} rat (${savings.yearsSaved} lat, ${savings.monthsSavedRem} mies.)</td>
            </tr>
            <tr>
                <td><strong>Przewidywana data zakończenia</strong></td>
                <td>${stdEndDateLabel}</td>
                <td class="text-primary">${overEndDateLabel}</td>
                <td class="text-success">Szybciej o ${savings.months} mies.</td>
            </tr>
            <tr>
                <td><strong>Suma zrealizowanych nadpłat</strong></td>
                <td>0,00 PLN</td>
                <td class="text-primary">${formatPLN(over.totalOverpayments)}</td>
                <td>--</td>
            </tr>
        </tbody>
    </table>
    
    <table class="kpi-table">
        <tr>
            <td class="kpi-cell">
                <div class="kpi-card savings">
                    <div class="kpi-label">Zaoszczędzone odsetki</div>
                    <div class="kpi-value">${formatPLN(savings.interest)}</div>
                    <div style="font-size: 9.5pt; color: #047857;">Suma kosztów odsetkowych mniejsza o ${savings.percent.toFixed(2)}%</div>
                </div>
            </td>
            <td class="kpi-cell">
                <div class="kpi-card term">
                    <div class="kpi-label">Okres spłaty skrócony o</div>
                    <div class="kpi-value">${savings.months} rat</div>
                    <div style="font-size: 9.5pt; color: #1D4ED8;">Spłata szybsza o ${savings.yearsSaved} lat i ${savings.monthsSavedRem} mies.</div>
                </div>
            </td>
        </tr>
    </table>
    
    <div class="page-break"></div>
    
    <div class="section-title">2. Wizualizacja Graficzna Spłaty</div>
    <p style="font-size: 10pt; margin-bottom: 15px;">Wizualizacja podziału kosztów rocznych oraz tempa spłaty pozostałego kapitału zadłużenia.</p>
    
    <div class="chart-box">
        <div style="font-weight: bold; margin-bottom: 5px; font-size: 10.5pt; color: #0F172A;">Harmonogram spłaty rocznej (kapitał vs. odsetki vs. nadpłaty)</div>
        <img src="cid:chart-yearly-cost.png" class="chart-image" alt="Wykres spłaty rocznej">
        <div style="font-size: 8.5pt; color: #64748B; margin-top: 5px;">Rysunek 1: Roczny podział spłaty kapitału, odsetek oraz nadpłat w scenariuszu z nadpłatami.</div>
    </div>
    
    <div class="chart-box">
        <div style="font-weight: bold; margin-bottom: 5px; font-size: 10.5pt; color: #0F172A;">Tempo spłaty kapitału kredytu (Bez nadpłat vs Z nadpłatami)</div>
        <img src="cid:chart-loan-balance.png" class="chart-image" alt="Wykres spadku salda">
        <div style="font-size: 8.5pt; color: #64748B; margin-top: 5px;">Rysunek 2: Porównanie spadku pozostałego salda kredytu w czasie. Linia przerywana przedstawia scenariusz standardowy.</div>
    </div>
    
    <div class="page-break"></div>
    
    <div class="section-title">3. Szczegółowy Plan Spłat (Pierwsze 12 rat)</div>
    <p style="font-size: 10pt; margin-bottom: 15px;">Początkowe 12 miesięcy spłaty kredytu z uwzględnieniem podziału raty podstawowej oraz planowanych nadpłat.</p>
    
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 8%;">Nr</th>
                <th style="width: 14%;">Miesiąc</th>
                <th style="width: 15%;">Kapitał</th>
                <th style="width: 15%;">Odsetki</th>
                <th style="width: 15%;">Rata</th>
                <th style="width: 15%;">Nadpłata</th>
                <th style="width: 18%;">Suma płatności</th>
            </tr>
        </thead>
        <tbody>
            ${scheduleRowsHtml}
            <tr class="sum-row">
                <td>Suma</td>
                <td>12 mies.</td>
                <td>${formatPLN(previewSums.capital)}</td>
                <td>${formatPLN(previewSums.interest)}</td>
                <td>${formatPLN(previewSums.instalment)}</td>
                <td>${formatPLN(previewSums.overpayment)}</td>
                <td>${formatPLN(previewSums.totalCost)}</td>
            </tr>
        </tbody>
    </table>
    
    <div style="margin-top: 20px; border-left: 3px solid #2563EB; padding-left: 12px; font-size: 9.5pt; color: #475569; line-height: 1.4;">
        <strong>Informacja dodatkowa:</strong><br>
        1. Obliczenia przeprowadzono przy założeniu niezmiennego oprocentowania w całym okresie kredytowania.<br>
        2. Wpływ nadpłat realizowany jest w modelu: <strong>${strategyDescription}</strong>.<br>
        3. Rzeczywisty harmonogram spłat generowany przez bank może nieznacznie odbiegać ze względu na specyficzne zasady naliczania odsetek w danym banku (np. liczba dni w roku, dni wolne).
    </div>
</body>
</html>`;

    // Construct MHTML
    const boundary = 'NEXT.ITEM-BOUNDARY';
    let mhtml = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset="utf-8"
Content-Location: file:///main.html

${htmlTemplate}
`;

    if (yearlyCostChartBase64) {
        mhtml += `
--${boundary}
Content-ID: <chart-yearly-cost.png>
Content-Location: file:///chart-yearly-cost.png
Content-Type: image/png
Content-Transfer-Encoding: base64

${yearlyCostChartBase64}
`;
    }

    if (loanBalanceChartBase64) {
        mhtml += `
--${boundary}
Content-ID: <chart-loan-balance.png>
Content-Location: file:///chart-loan-balance.png
Content-Type: image/png
Content-Transfer-Encoding: base64

${loanBalanceChartBase64}
`;
    }

    mhtml += `\n--${boundary}--`;

    const blob = new Blob([mhtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    const formattedDate = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `Raport_Kredytowy_Nadplaty_${formattedDate}.doc`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Wyeksportowano profesjonalny raport do pliku Word (.doc).', 'success');
}
