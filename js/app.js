/**
 * Kalkulator Kredytu Hipotecznego - Unified Application Logic
 * Combines services, financial mathematics, rendering, and controller state
 * to ensure CORS-free execution when opened directly via the file:// protocol.
 */

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================

const FALLBACK_WIBOR = {
    '1M': { value: 3.82, date: '2026-05-22', isFallback: true },
    '3M': { value: 3.86, date: '2026-05-22', isFallback: true },
    '6M': { value: 3.95, date: '2026-05-22', isFallback: true }
};

const state = {
    fetchedWibor: null,
    customOverpayments: [],
    currentPage: 1,
    pageSize: 12,
    activeCalculation: null
};

// ==========================================
// 2. WIBOR SERVICE
// ==========================================

async function fetchWiborRates() {
    const proxyUrls = [
        (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
        (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
        (target) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(target)}`
    ];
    
    const bankierUrl = 'https://www.bankier.pl/mieszkaniowe/stopy-procentowe/wibor';
    let rates = {};
    let bankierSuccess = false;
    
    for (const getProxyUrl of proxyUrls) {
        try {
            const requestUrl = getProxyUrl(bankierUrl);
            const response = await fetch(requestUrl);
            if (!response.ok) continue;
            
            let html = '';
            if (requestUrl.includes('allorigins')) {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }
            
            if (html) {
                rates = parseBankierHtml(html);
                if (Object.keys(rates).length > 0) {
                    bankierSuccess = true;
                    break;
                }
            }
        } catch (error) {
            console.warn('Bankier fetch failed using proxy, trying next...', error);
        }
    }
    
    if (bankierSuccess) {
        return {
            rates: {
                '1M': rates['1M'] || FALLBACK_WIBOR['1M'],
                '3M': rates['3M'] || FALLBACK_WIBOR['3M'],
                '6M': rates['6M'] || FALLBACK_WIBOR['6M']
            },
            success: true,
            message: 'Pomyślnie pobrano aktualne stawki WIBOR z serwisu Bankier.pl!'
        };
    }
    
    console.warn('All live sources failed. Using fallback data.');
    return {
        rates: FALLBACK_WIBOR,
        success: false,
        message: 'Nie udało się pobrać aktualnych stawek z serwisu Bankier.pl. Użyto ostatnich dostępnych z 22.05.2026 r.'
    };
}

function parseBankierHtml(html) {
    const rates = {};
    const regex = /WIBOR\s+(1M|3M|6M)<\/a><\/td>\s*<td[^>]*>\s*([\d,]+)%/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const term = match[1].toUpperCase();
        const value = parseFloat(match[2].replace(',', '.'));
        if (!isNaN(value) && !rates[term]) {
            rates[term] = {
                value: value,
                date: new Date().toISOString().slice(0, 10),
                isFallback: false
            };
        }
    }
    return rates;
}

function parseWiborHtml(html) {
    const rates = {};
    const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
    
    // Regex matching table cell rows: Termin | WIBID | WIBOR | Data
    const regex = /<td>\s*(1M|3M|6M)\s*<\/td>\s*<td>\s*([\d,]*%?)\s*<\/td>\s*<td>\s*([\d,]+)%?\s*<\/td>\s*<td>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/g;
    
    let match;
    while ((match = regex.exec(cleanHtml)) !== null) {
        const term = match[1].trim();
        const wiborStr = match[3].trim();
        const date = match[4].trim();
        const value = parseFloat(wiborStr.replace(',', '.'));
        
        if (!isNaN(value)) {
            rates[term] = {
                value: value,
                date: date,
                isFallback: false
            };
        }
    }
    return rates;
}

// ==========================================
// 3. FINANCIAL CALCULATIONS ENGINE
// ==========================================

function calculateAnnuityInstalment(principal, monthlyRate, months) {
    if (months <= 0) return 0;
    if (monthlyRate === 0) return principal / months;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

function generateMortgageSchedules({
    principal,
    wibor,
    margin,
    monthsRemaining,
    startMonthYear,
    monthlyOverpayment = 0,
    overpaymentImpact = 'reduce_duration',
    customOverpayments = []
}) {
    const annualRate = (wibor + margin) / 100;
    const monthlyRate = annualRate / 12;

    let [startYear, startMonth] = (startMonthYear || new Date().toISOString().slice(0, 7)).split('-').map(Number);

    const getMonthLabel = (index) => {
        const totalMonths = (startMonth - 1) + index;
        const currentYear = startYear + Math.floor(totalMonths / 12);
        const currentMonthNum = (totalMonths % 12) + 1;
        const monthPad = String(currentMonthNum).padStart(2, '0');
        return `${monthPad}-${currentYear}`;
    };

    const getMonthDate = (index) => {
        const totalMonths = (startMonth - 1) + index;
        const year = startYear + Math.floor(totalMonths / 12);
        const month = totalMonths % 12;
        return new Date(year, month, 25);
    };

    // Standard Schedule
    const standardSchedule = [];
    let stdBalance = principal;
    const stdInstalment = calculateAnnuityInstalment(principal, monthlyRate, monthsRemaining);
    let stdTotalInterest = 0;
    let stdTotalCapital = 0;

    for (let i = 0; i < monthsRemaining; i++) {
        const interest = stdBalance * monthlyRate;
        let capital = stdInstalment - interest;
        
        if (stdBalance - capital < 0.01) {
            capital = stdBalance;
        }

        stdBalance -= capital;
        stdTotalInterest += interest;
        stdTotalCapital += capital;

        standardSchedule.push({
            nr: i + 1,
            monthLabel: getMonthLabel(i),
            date: getMonthDate(i),
            capitalPaid: capital,
            interestPaid: interest,
            instalment: capital + interest,
            overpayment: 0,
            totalCost: capital + interest,
            balance: stdBalance < 0.01 ? 0 : stdBalance
        });

        if (stdBalance < 0.01) break;
    }

    // Overpaid Schedule
    const overpaymentSchedule = [];
    let overBalance = principal;
    let overTotalInterest = 0;
    let overTotalCapital = 0;
    let overTotalOverpayments = 0;
    const initialAnnuityInstalment = stdInstalment;

    const customOverpaymentMap = new Map();
    customOverpayments.forEach(co => {
        customOverpaymentMap.set(co.monthIndex, co.amount);
    });

    let currentScheduledInstalment = initialAnnuityInstalment;

    for (let i = 0; i < monthsRemaining * 2; i++) {
        if (overBalance < 0.01) break;

        const interest = overBalance * monthlyRate;
        let scheduledInstalment = currentScheduledInstalment;

        if (overpaymentImpact === 'reduce_instalment') {
            const remainingOriginalMonths = Math.max(1, monthsRemaining - i);
            scheduledInstalment = calculateAnnuityInstalment(overBalance, monthlyRate, remainingOriginalMonths);
            currentScheduledInstalment = scheduledInstalment;
        }

        let scheduledCapital = scheduledInstalment - interest;
        if (scheduledCapital < 0) {
            scheduledCapital = 0;
        }

        if (overBalance - scheduledCapital < 0.01) {
            scheduledCapital = overBalance;
        }

        let overpayment = monthlyOverpayment;
        const monthNum = i + 1;
        if (customOverpaymentMap.has(monthNum)) {
            overpayment += customOverpaymentMap.get(monthNum);
        }

        const remainingCapitalAfterInstalment = Math.max(0, overBalance - scheduledCapital);
        if (overpayment > remainingCapitalAfterInstalment) {
            overpayment = remainingCapitalAfterInstalment;
        }

        const totalCapitalPaid = scheduledCapital + overpayment;
        overBalance -= totalCapitalPaid;
        overTotalInterest += interest;
        overTotalCapital += scheduledCapital;
        overTotalOverpayments += overpayment;

        overpaymentSchedule.push({
            nr: i + 1,
            monthLabel: getMonthLabel(i),
            date: getMonthDate(i),
            capitalPaid: scheduledCapital,
            interestPaid: interest,
            instalment: scheduledCapital + interest,
            overpayment: overpayment,
            totalCost: scheduledCapital + interest + overpayment,
            balance: overBalance < 0.01 ? 0 : overBalance
        });
    }

    const stdSumCosts = stdTotalCapital + stdTotalInterest;
    const overSumCosts = overTotalCapital + overTotalInterest + overTotalOverpayments;
    const interestSavings = Math.max(0, stdTotalInterest - overTotalInterest);
    const costSavingsPercent = stdSumCosts > 0 ? (interestSavings / stdSumCosts) * 100 : 0;
    
    const stdDuration = standardSchedule.length;
    const overDuration = overpaymentSchedule.length;
    const monthsSaved = Math.max(0, stdDuration - overDuration);

    const lastPaymentDate = overpaymentSchedule[overpaymentSchedule.length - 1]?.date || new Date();
    
    return {
        standard: {
            schedule: standardSchedule,
            totalCapital: stdTotalCapital,
            totalInterest: stdTotalInterest,
            totalCost: stdSumCosts,
            duration: stdDuration
        },
        overpaid: {
            schedule: overpaymentSchedule,
            totalCapital: overTotalCapital,
            totalInterest: overTotalInterest,
            totalOverpayments: overTotalOverpayments,
            totalCost: overSumCosts,
            duration: overDuration,
            lastPaymentDate: lastPaymentDate
        },
        savings: {
            interest: interestSavings,
            percent: costSavingsPercent,
            months: monthsSaved,
            yearsSaved: Math.floor(monthsSaved / 12),
            monthsSavedRem: monthsSaved % 12
        }
    };
}

function calculateMonthsFromEndDate(endMonthYear, startMonthYear) {
    if (!endMonthYear) return 120;
    const [endYear, endMonth] = endMonthYear.split('-').map(Number);
    
    let startYear, startMonth;
    if (startMonthYear) {
        [startYear, startMonth] = startMonthYear.split('-').map(Number);
    } else {
        const d = new Date();
        startYear = d.getFullYear();
        startMonth = d.getMonth() + 1;
    }
    
    const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    return Math.max(1, months);
}

// ==========================================
// 4. CHART RENDERER
// ==========================================

let costChartInstance = null;
let balanceChartInstance = null;

function destroyCharts() {
    if (costChartInstance) {
        costChartInstance.destroy();
        costChartInstance = null;
    }
    if (balanceChartInstance) {
        balanceChartInstance.destroy();
        balanceChartInstance = null;
    }
}

const formatCurrencyValue = (val) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(val);
};

function groupDataByYear(schedule) {
    const yearlyMap = {};
    schedule.forEach(row => {
        const year = row.monthLabel.split('-')[1];
        if (!yearlyMap[year]) {
            yearlyMap[year] = { capital: 0, interest: 0, overpayment: 0 };
        }
        yearlyMap[year].capital += row.capitalPaid;
        yearlyMap[year].interest += row.interestPaid;
        yearlyMap[year].overpayment += row.overpayment;
    });
    return yearlyMap;
}

function renderMortgageCharts(costCanvas, balanceCanvas, data) {
    destroyCharts();
    if (!costCanvas || !balanceCanvas || !data) return;

    // Stacked bar chart
    const yearlyOverpaidData = groupDataByYear(data.overpaid.schedule);
    const years = Object.keys(yearlyOverpaidData).sort();
    
    const capitalData = [];
    const interestData = [];
    const overpaymentData = [];
    
    years.forEach(yr => {
        capitalData.push(Math.round(yearlyOverpaidData[yr].capital));
        interestData.push(Math.round(yearlyOverpaidData[yr].interest));
        overpaymentData.push(Math.round(yearlyOverpaidData[yr].overpayment));
    });

    costChartInstance = new Chart(costCanvas, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Kapitał spłacony',
                    data: capitalData,
                    backgroundColor: '#1E293B',
                    borderRadius: 4,
                    stack: 'Stack 0'
                },
                {
                    label: 'Nadpłaty',
                    data: overpaymentData,
                    backgroundColor: '#10B981',
                    borderRadius: 4,
                    stack: 'Stack 0'
                },
                {
                    label: 'Odsetki',
                    data: interestData,
                    backgroundColor: '#EF4444',
                    borderRadius: 4,
                    stack: 'Stack 0'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { family: 'Inter', size: 11, weight: '500' },
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${formatCurrencyValue(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: {
                    stacked: true,
                    ticks: { callback: function(value) { return formatCurrencyValue(value); } }
                }
            }
        }
    });

    // Balance decline comparison
    const stdSchedule = data.standard.schedule;
    const overSchedule = data.overpaid.schedule;
    const allLabels = stdSchedule.map(row => row.monthLabel);

    balanceChartInstance = new Chart(balanceCanvas, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Bez nadpłat (Standard)',
                    data: stdSchedule.map(row => Math.round(row.balance)),
                    borderColor: '#94A3B8',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Z nadpłatami',
                    data: overSchedule.map(row => Math.round(row.balance)),
                    borderColor: '#2563EB',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { family: 'Inter', size: 11, weight: '500' },
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${formatCurrencyValue(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 12, font: { size: 10 } }
                },
                y: {
                    ticks: { callback: function(value) { return formatCurrencyValue(value); } }
                }
            }
        }
    });
}

// ==========================================
// 5. DOM HELPERS
// ==========================================

function formatPLN(value) {
    if (value === undefined || value === null || isNaN(value)) return '0,00 PLN';
    const formatted = new Intl.NumberFormat('pl-PL', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
    return `${formatted} PLN`.replace(/\s/g, ' ');
}

function formatPolishMonth(date) {
    const months = [
        'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
        'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatPolishDateLong(date) {
    const months = [
        'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
        'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function renderScheduleTable(tbody, schedule, page, pageSize, totalSums, onAddOverpayment) {
    tbody.innerHTML = '';
    
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, schedule.length);
    const paginatedItems = schedule.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">Brak danych. Wprowadź parametry kredytu.</td></tr>`;
        return;
    }

    paginatedItems.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.nr}</td>
            <td>${row.monthLabel}</td>
            <td><span class="table-badge capital-badge">${formatPLN(row.capitalPaid)}</span></td>
            <td><span class="table-badge interest">${formatPLN(row.interestPaid)}</span></td>
            <td>${formatPLN(row.instalment)}</td>
            <td>
                <span class="table-badge overpayment" data-nr="${row.nr}">
                    ${row.overpayment > 0 ? formatPLN(row.overpayment) : '+ Dodaj'}
                </span>
            </td>
            <td><span class="table-badge cost">${formatPLN(row.totalCost)}</span></td>
        `;

        const opBadge = tr.querySelector('.table-badge.overpayment');
        opBadge.addEventListener('click', () => {
            onAddOverpayment(row.nr, row.overpayment);
        });

        tbody.appendChild(tr);
    });

    const sumTr = document.createElement('tr');
    sumTr.className = 'sum-row';
    sumTr.innerHTML = `
        <td>Suma</td>
        <td>${totalSums.duration}</td>
        <td>${formatPLN(totalSums.totalCapital)}</td>
        <td>${formatPLN(totalSums.totalInterest)}</td>
        <td>${formatPLN(totalSums.totalInstalments)}</td>
        <td>${formatPLN(totalSums.totalOverpayments)}</td>
        <td>${formatPLN(totalSums.totalCost)}</td>
    `;
    tbody.appendChild(sumTr);
}

function initTooltips() {
    const existing = document.querySelectorAll('.custom-tooltip-box');
    existing.forEach(e => e.remove());

    const tooltipElements = document.querySelectorAll('.has-tooltip');
    tooltipElements.forEach(el => {
        const text = el.getAttribute('data-tooltip');
        if (!text) return;

        if (!el.querySelector('.tooltip-icon')) {
            const span = document.createElement('span');
            span.className = 'tooltip-icon';
            span.innerText = 'i';
            el.appendChild(span);
        }

        el.addEventListener('mouseenter', (e) => {
            const box = document.createElement('div');
            box.className = 'custom-tooltip-box';
            box.innerText = text;
            box.style.position = 'absolute';
            box.style.backgroundColor = 'var(--color-primary)';
            box.style.color = 'var(--color-text-white)';
            box.style.padding = '0.5rem 0.75rem';
            box.style.borderRadius = 'var(--radius-sm)';
            box.style.fontSize = '0.75rem';
            box.style.fontWeight = '500';
            box.style.zIndex = '1200';
            box.style.maxWidth = '250px';
            box.style.boxShadow = 'var(--shadow-lg)';
            box.style.pointerEvents = 'none';
            box.style.opacity = '0';
            box.style.transition = 'opacity var(--transition-fast)';
            
            document.body.appendChild(box);
            
            const rect = el.getBoundingClientRect();
            const boxRect = box.getBoundingClientRect();
            
            const top = window.scrollY + rect.top - box.offsetHeight - 8;
            const left = window.scrollX + rect.left + (rect.width / 2) - (box.offsetWidth / 2);
            
            box.style.top = `${top}px`;
            box.style.left = `${left}px`;
            
            setTimeout(() => { box.style.opacity = '1'; }, 10);
            el._tooltipBox = box;
        });

        el.addEventListener('mouseleave', () => {
            if (el._tooltipBox) {
                el._tooltipBox.remove();
                el._tooltipBox = null;
            }
        });
    });
}

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="16" height="16" fill="var(--color-success)" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;
    } else if (type === 'warning') {
        iconSvg = `<svg width="16" height="16" fill="var(--color-warning)" viewBox="0 0 16 16"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <span class="toast-message" style="flex: 1; padding-right: 0.5rem;">${message}</span>
        <button type="button" class="toast-close" style="background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 1.125rem; font-weight: 600; line-height: 1; padding: 0.125rem 0.25rem; margin-left: auto; transition: var(--transition-fast);">&times;</button>
    `;
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = 'var(--color-text-main)');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = 'var(--color-text-muted)');
    
    container.appendChild(toast);

    let dismissTimeout;
    
    const dismiss = () => {
        if (dismissTimeout) clearTimeout(dismissTimeout);
        toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        toast.addEventListener('animationend', () => { toast.remove(); });
    };

    closeBtn.addEventListener('click', dismiss);

    dismissTimeout = setTimeout(dismiss, 5000);
}

// ==========================================
// 6. APPLICATION CONTROLLER
// ==========================================

let els = {};

window.addEventListener('DOMContentLoaded', async () => {
    // Cache elements
    els = {
        principalInput: document.getElementById('principal'),
        marginInput: document.getElementById('margin'),
        wiborInput: document.getElementById('wibor-value'),
        wiborTermSelector: document.getElementById('wibor-term-selector'),
        wiborStatusDot: document.getElementById('wibor-status-dot'),
        wiborStatusText: document.getElementById('wibor-status-text'),
        startMonthInput: document.getElementById('start-month'),
        durationModeSelect: document.getElementById('duration-mode'),
        monthsInputGroup: document.getElementById('months-input-group'),
        endDateInputGroup: document.getElementById('end-date-input-group'),
        monthsInput: document.getElementById('months-remaining'),
        endDateInput: document.getElementById('end-date'),
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
        barCapital: document.getElementById('bar-capital'),
        barInterest: document.getElementById('bar-interest'),
        barCapitalPct: document.getElementById('bar-capital-pct'),
        barInterestPct: document.getElementById('bar-interest-pct'),
        nextInstalmentVal: document.getElementById('next-instalment-val'),
        nextInstalmentDate: document.getElementById('next-instalment-date'),
        nextInstalmentOverpayment: document.getElementById('next-instalment-overpayment'),
        costCanvas: document.getElementById('chart-yearly-cost'),
        balanceCanvas: document.getElementById('chart-loan-balance'),
        tableBody: document.getElementById('schedule-table-body'),
        pageSizeSelect: document.getElementById('page-size-select'),
        btnPrevPage: document.getElementById('btn-prev-page'),
        btnNextPage: document.getElementById('btn-next-page'),
        pageInfoText: document.getElementById('page-info-text'),
        modalOverlay: document.getElementById('modal-overpayment'),
        modalTitle: document.getElementById('modal-title'),
        modalMonthInput: document.getElementById('modal-month'),
        modalAmountInput: document.getElementById('modal-amount'),
        modalClose: document.getElementById('modal-close'),
        modalCancel: document.getElementById('modal-cancel'),
        modalSubmit: document.getElementById('modal-submit'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnExportWord: document.getElementById('btn-export-word'),
        btnExportWordTop: document.getElementById('btn-export-word-top'),
        warningBox: document.getElementById('calculator-placeholder-warning'),
        warningList: document.getElementById('warning-missing-list'),
        resultsWrapper: document.getElementById('calculator-results-wrapper'),
        interestTypeVariable: document.getElementById('interest-type-variable'),
        interestTypeFixed: document.getElementById('interest-type-fixed'),
        variableRateFields: document.getElementById('variable-rate-fields'),
        fixedRateFields: document.getElementById('fixed-rate-fields'),
        fixedRateInput: document.getElementById('fixed-rate')
    };

    setDefaultValues();
    setupEventListeners();
    await handleWiborFetch();
    loadStateFromLocalStorage();
    await checkAndEnableTestData();
    recalculate();
    initTooltips();
});

async function checkAndEnableTestData() {
    try {
        const response = await fetch('js/test-config.json');
        if (!response.ok) return;
        const config = await response.json();
        
        const btn = document.createElement('button');
        btn.id = 'btn-load-test-data';
        btn.type = 'button';
        btn.className = 'wibor-status-badge';
        btn.style.cursor = 'pointer';
        btn.style.backgroundColor = 'var(--color-success-light)';
        btn.style.color = 'var(--color-success)';
        btn.style.borderColor = 'var(--color-success)';
        btn.style.fontWeight = '600';
        btn.style.marginRight = '0.75rem';
        btn.style.padding = '0.5rem 1rem';
        btn.style.transition = 'var(--transition-fast)';
        btn.innerHTML = '⚡ Wczytaj moje dane';
        
        btn.addEventListener('mouseenter', () => {
            btn.style.backgroundColor = 'var(--color-success)';
            btn.style.color = 'var(--color-text-white)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.backgroundColor = 'var(--color-success-light)';
            btn.style.color = 'var(--color-success)';
        });
        
        btn.addEventListener('click', () => {
            if (config.principal) els.principalInput.value = config.principal;
            if (config.margin) els.marginInput.value = config.margin;
            if (config.months) {
                els.monthsInput.value = config.months;
                els.durationModeSelect.value = 'months';
                els.monthsInputGroup.style.display = 'block';
                els.endDateInputGroup.style.display = 'none';
                updateEndDateFromMonths();
            }
            
            state.interestType = 'variable';
            els.interestTypeVariable.classList.add('active');
            els.interestTypeFixed.classList.remove('active');
            els.variableRateFields.style.display = 'block';
            els.fixedRateFields.style.display = 'none';
            
            const wibor3mBtn = els.wiborTermSelector.querySelector('.wibor-btn[data-term="3M"]');
            if (wibor3mBtn) {
                wibor3mBtn.click();
            } else {
                recalculate();
            }
            
            showToast('Utylizowano poufne dane testowe!', 'success');
        });
        
        const header = document.querySelector('.header');
        const badge = document.getElementById('wibor-sync-badge');
        if (header && badge) {
            header.insertBefore(btn, badge);
        }
    } catch (e) {
        console.warn('Test config not found, skipping test button injection.', e);
    }
}

function saveStateToLocalStorage() {
    try {
        if (!els.principalInput) return;
        const activeWiborBtn = els.wiborTermSelector.querySelector('.wibor-btn.active');
        const wiborTerm = activeWiborBtn ? activeWiborBtn.getAttribute('data-term') : null;
        
        const data = {
            principal: els.principalInput.value,
            margin: els.marginInput.value,
            wibor: els.wiborInput.value,
            fixedRate: els.fixedRateInput.value,
            startMonth: els.startMonthInput.value,
            durationMode: els.durationModeSelect.value,
            months: els.monthsInput.value,
            endDate: els.endDateInput.value,
            overpaymentBase: els.overpaymentBaseInput.value,
            interestType: state.interestType,
            overpaymentImpact: els.overpaymentImpactDuration.checked ? 'reduce_duration' : 'reduce_instalment',
            recurrenceType: els.segmentedRecurrenceBase.classList.contains('active') ? 'monthly' : 'single',
            customOverpayments: state.customOverpayments,
            wiborTerm: wiborTerm
        };
        localStorage.setItem('mortgage_calculator_state', JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save state to localStorage:', e);
    }
}

function loadStateFromLocalStorage() {
    const saved = localStorage.getItem('mortgage_calculator_state');
    if (!saved) return false;
    try {
        const data = JSON.parse(saved);
        
        els.principalInput.value = data.principal || '';
        els.marginInput.value = data.margin || '';
        els.wiborInput.value = data.wibor || '';
        els.fixedRateInput.value = data.fixedRate || '';
        els.startMonthInput.value = data.startMonth || '2026-06';
        els.durationModeSelect.value = data.durationMode || 'months';
        els.monthsInput.value = data.months || '';
        els.endDateInput.value = data.endDate || '';
        els.overpaymentBaseInput.value = data.overpaymentBase || '';
        
        state.interestType = data.interestType || 'variable';
        if (state.interestType === 'fixed') {
            els.interestTypeFixed.classList.add('active');
            els.interestTypeVariable.classList.remove('active');
            els.fixedRateFields.style.display = 'block';
            els.variableRateFields.style.display = 'none';
        } else {
            els.interestTypeVariable.classList.add('active');
            els.interestTypeFixed.classList.remove('active');
            els.variableRateFields.style.display = 'block';
            els.fixedRateFields.style.display = 'none';
        }
        
        if (els.durationModeSelect.value === 'months') {
            els.monthsInputGroup.style.display = 'block';
            els.endDateInputGroup.style.display = 'none';
        } else {
            els.monthsInputGroup.style.display = 'none';
            els.endDateInputGroup.style.display = 'block';
        }

        if (data.overpaymentImpact === 'reduce_instalment') {
            els.overpaymentImpactInstalment.checked = true;
            els.overpaymentImpactDuration.checked = false;
        } else {
            els.overpaymentImpactDuration.checked = true;
            els.overpaymentImpactInstalment.checked = false;
        }
        
        if (data.recurrenceType === 'single') {
            els.segmentedRecurrenceSingle.classList.add('active');
            els.segmentedRecurrenceBase.classList.remove('active');
            els.overpaymentBaseInput.setAttribute('disabled', 'true');
        } else {
            els.segmentedRecurrenceBase.classList.add('active');
            els.segmentedRecurrenceSingle.classList.remove('active');
            els.overpaymentBaseInput.removeAttribute('disabled');
        }
        
        state.customOverpayments = data.customOverpayments || [];
        renderCustomOverpaymentsList();
        
        els.wiborTermSelector.querySelectorAll('.wibor-btn').forEach(b => b.classList.remove('active'));
        if (data.wiborTerm) {
            const activeBtn = els.wiborTermSelector.querySelector(`.wibor-btn[data-term="${data.wiborTerm}"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }
        
        return true;
    } catch (e) {
        console.error('Error loading state from localStorage:', e);
        return false;
    }
}

function setDefaultValues() {
    els.principalInput.value = '';
    els.marginInput.value = '';
    els.wiborInput.value = '';
    els.fixedRateInput.value = '';
    
    // Reset interest type to Variable
    state.interestType = 'variable';
    els.interestTypeVariable.classList.add('active');
    els.interestTypeFixed.classList.remove('active');
    els.variableRateFields.style.display = 'block';
    els.fixedRateFields.style.display = 'none';
    
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
    els.wiborStatusText.innerHTML = `WIBOR 3M: <strong>${state.fetchedWibor['3M'].value.toFixed(2)}%</strong> (${result.rates['3M'].isFallback ? 'zapasowe z 22.05.26' : 'aktualne z bankier.pl'})`;
    
    if (result.success) {
        showToast(result.message, 'success');
    } else {
        showToast(result.message, 'warning');
    }
    
    // We do NOT auto-populate els.wiborInput.value at startup to keep it empty.
    // The user can click '1M', '3M', '6M' buttons to load them, or click 'Własny' to type.
}

function setupEventListeners() {
    const inputsToTrigger = [
        els.principalInput, els.marginInput, els.wiborInput, 
        els.fixedRateInput, els.startMonthInput, els.monthsInput, 
        els.endDateInput, els.overpaymentBaseInput
    ];
    
    inputsToTrigger.forEach(el => {
        el.addEventListener('input', () => {
            if (el === els.endDateInput && els.durationModeSelect.value === 'date') {
                const calculatedMonths = calculateMonthsFromEndDate(els.endDateInput.value, els.startMonthInput.value);
                els.monthsInput.value = calculatedMonths;
            }
            if (el === els.monthsInput && els.durationModeSelect.value === 'months') {
                updateEndDateFromMonths();
            }
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
    
    // Interest Type Switcher (Variable vs Fixed)
    els.interestTypeVariable.addEventListener('click', () => {
        state.interestType = 'variable';
        els.interestTypeVariable.classList.add('active');
        els.interestTypeFixed.classList.remove('active');
        els.variableRateFields.style.display = 'block';
        els.fixedRateFields.style.display = 'none';
        recalculate();
    });

    els.interestTypeFixed.addEventListener('click', () => {
        state.interestType = 'fixed';
        els.interestTypeFixed.classList.add('active');
        els.interestTypeVariable.classList.remove('active');
        els.fixedRateFields.style.display = 'block';
        els.variableRateFields.style.display = 'none';
        recalculate();
    });
    
    els.wiborTermSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.wibor-btn');
        if (!btn) return;
        
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

    els.durationModeSelect.addEventListener('change', () => {
        const mode = els.durationModeSelect.value;
        if (mode === 'months') {
            els.monthsInputGroup.style.display = 'block';
            els.endDateInputGroup.style.display = 'none';
        } else {
            els.monthsInputGroup.style.display = 'none';
            els.endDateInputGroup.style.display = 'block';
            const calculatedMonths = calculateMonthsFromEndDate(els.endDateInput.value, els.startMonthInput.value);
            els.monthsInput.value = calculatedMonths;
            recalculate();
        }
    });

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

    els.segmentedRecurrenceBase.addEventListener('click', () => {
        els.segmentedRecurrenceBase.classList.add('active');
        els.segmentedRecurrenceSingle.classList.remove('active');
        els.overpaymentBaseInput.removeAttribute('disabled');
        if (els.overpaymentBaseInput.value === '0') {
            els.overpaymentBaseInput.value = '2000';
        }
        recalculate();
    });

    els.segmentedRecurrenceSingle.addEventListener('click', () => {
        els.segmentedRecurrenceSingle.classList.add('active');
        els.segmentedRecurrenceBase.classList.remove('active');
        els.overpaymentBaseInput.value = '0';
        els.overpaymentBaseInput.setAttribute('disabled', 'true');
        recalculate();
        showToast('Wybierz wiersz w tabeli na dole, aby dodać nadpłatę w konkretnym miesiącu.', 'warning');
    });

    els.btnAddCustomOverpayment.addEventListener('click', () => {
        openModalForMonth(1, 1000);
    });

    els.btnResetForm.addEventListener('click', () => {
        setDefaultValues();
        state.customOverpayments = [];
        renderCustomOverpaymentsList();
        state.currentPage = 1;
        recalculate();
        showToast('Formularz został zresetowany do wartości domyślnych.', 'warning');
    });

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

    els.modalClose.addEventListener('click', closeModal);
    els.modalCancel.addEventListener('click', closeModal);
    els.modalSubmit.addEventListener('click', saveModalOverpayment);
    els.modalOverlay.addEventListener('click', (e) => {
        if (e.target === els.modalOverlay) closeModal();
    });

    els.btnExportCsv.addEventListener('click', exportScheduleToCsv);
    els.btnExportWord.addEventListener('click', exportScheduleToWord);
    if (els.btnExportWordTop) {
        els.btnExportWordTop.addEventListener('click', exportScheduleToWord);
    }
}

function updateEndDateFromMonths() {
    const months = parseInt(els.monthsInput.value) || 240;
    const [startYear, startMonth] = els.startMonthInput.value.split('-').map(Number);
    const totalMonths = (startMonth - 1) + (months - 1);
    const endYear = startYear + Math.floor(totalMonths / 12);
    const endMonthVal = (totalMonths % 12) + 1;
    els.endDateInput.value = `${endYear}-${String(endMonthVal).padStart(2, '0')}`;
}

function recalculate() {
    // Save current form state to LocalStorage
    saveStateToLocalStorage();

    // 1. Gather missing / invalid inputs
    const missing = [];
    
    const principal = parseFloat(els.principalInput.value);
    if (!els.principalInput.value || isNaN(principal) || principal <= 0) {
        missing.push("Kapitał pozostały do spłaty (musi być większy niż 0 PLN)");
    }
    
    let margin = 0;
    let wibor = 0;
    
    if (state.interestType === 'fixed') {
        const fixedRate = parseFloat(els.fixedRateInput.value);
        if (!els.fixedRateInput.value || isNaN(fixedRate) || fixedRate <= 0) {
            missing.push("Oprocentowanie stałe (musi być większe niż 0 %)");
        } else {
            wibor = fixedRate;
            margin = 0;
        }
    } else {
        const marginVal = parseFloat(els.marginInput.value);
        if (!els.marginInput.value || isNaN(marginVal) || marginVal < 0) {
            missing.push("Marża banku (np. 2,35 %)");
        } else {
            margin = marginVal;
        }
        
        const wiborVal = parseFloat(els.wiborInput.value);
        if (!els.wiborInput.value || isNaN(wiborVal) || wiborVal < 0) {
            missing.push("Stawka WIBOR (wybierz okres 1M/3M/6M lub wpisz własną)");
        } else {
            wibor = wiborVal;
        }
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

    els.kpiTotalToPay.innerText = formatPLN(over.totalCost);
    
    const capPct = over.totalCost > 0 ? (over.totalCapital / over.totalCost) * 100 : 0;
    const intPct = over.totalCost > 0 ? (over.totalInterest / over.totalCost) * 100 : 0;
    
    els.barCapital.style.width = `${capPct}%`;
    els.barInterest.style.width = `${intPct}%`;
    els.barCapitalPct.innerText = `${capPct.toFixed(2)}%`;
    els.barInterestPct.innerText = `${intPct.toFixed(2)}%`;
    
    els.kpiCapitalPart.innerText = formatPLN(over.totalCapital);
    els.kpiInterestPart.innerText = formatPLN(over.totalInterest);
    els.kpiEndDate.innerText = formatPolishMonth(over.lastPaymentDate);
    
    const yrs = Math.floor(over.duration / 12);
    const mths = over.duration % 12;
    els.kpiRemainingMonths.innerText = over.duration;
    els.kpiRemainingYearsText.innerText = `(${yrs} lat, ${mths} miesięcy)`;
    
    els.kpiSavingsAmount.innerText = formatPLN(savings.interest);
    els.kpiSavingsPercent.innerText = `${savings.percent.toFixed(2)}%`;
    els.kpiOverpaymentsSum.innerText = formatPLN(over.totalOverpayments);
    els.kpiMonthsSaved.innerText = savings.months;

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

    if (over.schedule.length > 0) {
        const nextInstalment = over.schedule[0];
        els.nextInstalmentVal.innerText = formatPLN(nextInstalment.instalment);
        els.nextInstalmentDate.innerText = `Rata za ${formatPolishMonth(nextInstalment.date)}`;
        
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
    
    const totalSums = {
        duration: over.duration,
        totalCapital: over.totalCapital,
        totalInterest: over.totalInterest,
        totalInstalments: over.totalCapital + over.totalInterest,
        totalOverpayments: over.totalOverpayments,
        totalCost: over.totalCost
    };

    renderScheduleTable(
        els.tableBody, 
        over.schedule, 
        state.currentPage, 
        state.pageSize, 
        totalSums,
        (nr, currentOverpayment) => {
            openModalForMonth(nr, currentOverpayment);
        }
    );

    const maxPages = Math.ceil(over.schedule.length / state.pageSize);
    els.btnPrevPage.disabled = state.currentPage === 1;
    els.btnNextPage.disabled = state.currentPage >= maxPages || maxPages === 0;
    
    const startRange = over.schedule.length > 0 ? (state.currentPage - 1) * state.pageSize + 1 : 0;
    const endRange = Math.min(state.currentPage * state.pageSize, over.schedule.length);
    els.pageInfoText.innerText = `${startRange}-${endRange} z ${over.schedule.length}`;
}

function openModalForMonth(monthIndex, currentAmount) {
    els.modalMonthInput.value = monthIndex;
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
    
    state.customOverpayments = state.customOverpayments.filter(co => co.monthIndex !== monthIndex);
    if (amount > 0) {
        state.customOverpayments.push({ monthIndex, amount });
        state.customOverpayments.sort((a, b) => a.monthIndex - b.monthIndex);
        showToast(`Dodano nadpłatę jednorazową ${formatPLN(amount)} w racie nr ${monthIndex}`, 'success');
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

function exportScheduleToCsv() {
    const calc = state.activeCalculation;
    if (!calc || !calc.overpaid.schedule.length) {
        showToast('Brak danych do wyeksportowania.', 'warning');
        return;
    }
    const schedule = calc.overpaid.schedule;
    let csvContent = 'Nr;Miesiąc;Kapitał (rata);Odsetki;Rata;Nadpłata;Suma kosztów;Pozostały Kapitał\r\n';
    
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
    const fixedRate = parseFloat(els.fixedRateInput.value) || 0;
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
