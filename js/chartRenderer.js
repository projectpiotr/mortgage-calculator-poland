/**
 * Chart Renderer Service
 * Wraps Chart.js to draw and update the interactive dashboards.
 */

let costChartInstance = null;
let balanceChartInstance = null;

/**
 * Destroys existing charts to avoid layout and hover conflicts.
 */
export function destroyCharts() {
    if (costChartInstance) {
        costChartInstance.destroy();
        costChartInstance = null;
    }
    if (balanceChartInstance) {
        balanceChartInstance.destroy();
        balanceChartInstance = null;
    }
}

/**
 * Formats numbers into currency text (PLN).
 */
const formatCurrencyValue = (val) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(val);
};

/**
 * Groups monthly schedule data by calendar year for bar chart.
 */
function groupDataByYear(schedule) {
    const yearlyMap = {};
    
    schedule.forEach(row => {
        const year = row.monthLabel.split('-')[1];
        if (!yearlyMap[year]) {
            yearlyMap[year] = {
                capital: 0,
                interest: 0,
                overpayment: 0
            };
        }
        yearlyMap[year].capital += row.capitalPaid;
        yearlyMap[year].interest += row.interestPaid;
        yearlyMap[year].overpayment += row.overpayment;
    });
    
    return yearlyMap;
}

/**
 * Renders or updates both charts based on calculated mortgage schedules.
 * @param {HTMLCanvasElement} costCanvas - Canvas for stacked yearly costs
 * @param {HTMLCanvasElement} balanceCanvas - Canvas for balance comparison
 * @param {Object} data - Result of generateMortgageSchedules()
 */
export function renderMortgageCharts(costCanvas, balanceCanvas, data) {
    destroyCharts();

    if (!costCanvas || !balanceCanvas || !data) return;

    // --- CHART 1: YEARLY STACKED COST HARMONOGRAM ---
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
                    backgroundColor: '#1E293B', // Slate Navy
                    borderRadius: 4,
                    stack: 'Stack 0'
                },
                {
                    label: 'Nadpłaty',
                    data: overpaymentData,
                    backgroundColor: '#10B981', // Emerald Green
                    borderRadius: 4,
                    stack: 'Stack 0'
                },
                {
                    label: 'Odsetki',
                    data: interestData,
                    backgroundColor: '#EF4444', // Coral/Crimson
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
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrencyValue(value);
                        }
                    }
                }
            }
        }
    });

    // --- CHART 2: BALANCE COMPARISON (Overpaid vs Standard) ---
    // Downsample line chart to avoid overcrowding if there are hundreds of points
    const stdSchedule = data.standard.schedule;
    const overSchedule = data.overpaid.schedule;
    
    const maxDataPoints = 60; // Show up to 5 years monthly or yearly downsampled
    const stdStep = Math.max(1, Math.ceil(stdSchedule.length / maxDataPoints));
    const overStep = Math.max(1, Math.ceil(overSchedule.length / maxDataPoints));

    const stdLineData = [];
    const stdLabels = [];
    for (let i = 0; i < stdSchedule.length; i += stdStep) {
        stdLineData.push({ x: stdSchedule[i].monthLabel, y: Math.round(stdSchedule[i].balance) });
    }
    // Ensure final point is included
    if (stdSchedule.length > 0 && stdSchedule[stdSchedule.length - 1].balance === 0) {
        const lastRow = stdSchedule[stdSchedule.length - 1];
        stdLineData.push({ x: lastRow.monthLabel, y: 0 });
    }

    const overLineData = [];
    for (let i = 0; i < overSchedule.length; i += overStep) {
        overLineData.push({ x: overSchedule[i].monthLabel, y: Math.round(overSchedule[i].balance) });
    }
    if (overSchedule.length > 0 && overSchedule[overSchedule.length - 1].balance === 0) {
        const lastRow = overSchedule[overSchedule.length - 1];
        overLineData.push({ x: lastRow.monthLabel, y: 0 });
    }

    // Unify labels (all monthLabels from std as timeline baseline)
    const allLabels = stdSchedule.map(row => row.monthLabel);

    balanceChartInstance = new Chart(balanceCanvas, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Bez nadpłat (Standard)',
                    data: stdSchedule.map(row => Math.round(row.balance)),
                    borderColor: '#94A3B8', // Slate Light
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Z nadpłatami',
                    data: overSchedule.map(row => Math.round(row.balance)),
                    borderColor: '#2563EB', // Trust Blue
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
                    ticks: {
                        maxTicksLimit: 12,
                        font: { size: 10 }
                    }
                },
                y: {
                    ticks: {
                        callback: function(value) {
                            return formatCurrencyValue(value);
                        }
                    }
                }
            }
        }
    });
}
