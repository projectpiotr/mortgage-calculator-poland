/**
 * Mortgage Calculator Engine
 * Handles financial calculations for standard and overpaid schedules.
 */

/**
 * Calculates standard annuity instalment.
 * @param {number} principal - Remaining capital
 * @param {number} monthlyRate - Monthly interest rate (decimal)
 * @param {number} months - Remaining payments count
 * @returns {number} Monthly annuity instalment
 */
export function calculateAnnuityInstalment(principal, monthlyRate, months) {
    if (months <= 0) return 0;
    if (monthlyRate === 0) return principal / months;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

/**
 * Generates the complete mortgage schedule for both scenarios:
 * 1. Standard (without overpayments)
 * 2. Overpaid (with configured overpayments)
 * 
 * @param {Object} params
 * @param {number} params.principal - Remaining capital to pay
 * @param {number} params.wibor - WIBOR rate in % (e.g. 3.86)
 * @param {number} params.margin - Bank margin in % (e.g. 2.35)
 * @param {number} params.monthsRemaining - Total scheduled months
 * @param {string} params.startMonthYear - Month of first payment (format: 'YYYY-MM', default: current)
 * @param {number} params.monthlyOverpayment - Base recurring monthly overpayment amount
 * @param {string} params.overpaymentImpact - 'reduce_duration' or 'reduce_instalment'
 * @param {Array} params.customOverpayments - Array of { monthIndex: number, amount: number }
 * @returns {Object} Schedules, summaries, and savings calculations
 */
export function generateMortgageSchedules({
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

    // Parse start month/year
    let [startYear, startMonth] = (startMonthYear || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    // startMonth is 1-indexed (1 = January, 12 = December)

    // helper to get month/year string for row index
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
        return new Date(year, month, 25); // Assume 25th day of month
    };

    // 1. GENERATE STANDARD SCHEDULE
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

    // 2. GENERATE OVERPAYMENT SCHEDULE
    const overpaymentSchedule = [];
    let overBalance = principal;
    let overTotalInterest = 0;
    let overTotalCapital = 0;
    let overTotalOverpayments = 0;
    const initialAnnuityInstalment = stdInstalment; // Standard annuity to start with

    // Map custom overpayments for quick index lookup
    const customOverpaymentMap = new Map();
    customOverpayments.forEach(co => {
        customOverpaymentMap.set(co.monthIndex, co.amount);
    });

    let currentScheduledInstalment = initialAnnuityInstalment;

    for (let i = 0; i < monthsRemaining * 2; i++) { // Allow up to 2x duration just in case of negative amortizations (rate hikes)
        if (overBalance < 0.01) break;

        const interest = overBalance * monthlyRate;
        let scheduledInstalment = currentScheduledInstalment;

        if (overpaymentImpact === 'reduce_instalment') {
            // Recalculate instalment based on remaining capital and remaining months of the original term
            const remainingOriginalMonths = Math.max(1, monthsRemaining - i);
            scheduledInstalment = calculateAnnuityInstalment(overBalance, monthlyRate, remainingOriginalMonths);
            currentScheduledInstalment = scheduledInstalment;
        }

        let scheduledCapital = scheduledInstalment - interest;
        if (scheduledCapital < 0) {
            // Negative amortization (interest exceeds instalment) - caps scheduledCapital at 0
            scheduledCapital = 0;
        }

        if (overBalance - scheduledCapital < 0.01) {
            scheduledCapital = overBalance;
        }

        // Calculate overpayment
        let overpayment = monthlyOverpayment;
        // Check if there is a custom overpayment for this month
        const monthNum = i + 1;
        if (customOverpaymentMap.has(monthNum)) {
            overpayment += customOverpaymentMap.get(monthNum);
        }

        // Limit overpayment to remaining capital after scheduled capital payment
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

    // Calculations for summaries
    const stdSumCosts = stdTotalCapital + stdTotalInterest;
    const overSumCosts = overTotalCapital + overTotalInterest + overTotalOverpayments;
    
    // Savings
    const interestSavings = Math.max(0, stdTotalInterest - overTotalInterest);
    const costSavingsPercent = stdSumCosts > 0 ? (interestSavings / stdSumCosts) * 100 : 0;
    
    // Duration difference
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

/**
 * Calculates remaining months between current date and target end date.
 * @param {string} endMonthYear - Target end date (format: 'YYYY-MM')
 * @param {string} startMonthYear - Start month (format: 'YYYY-MM')
 * @returns {number} Number of remaining payments
 */
export function calculateMonthsFromEndDate(endMonthYear, startMonthYear) {
    if (!endMonthYear) return 120; // Default 10 years
    const [endYear, endMonth] = endMonthYear.split('-').map(Number);
    
    let startYear, startMonth;
    if (startMonthYear) {
        [startYear, startMonth] = startMonthYear.split('-').map(Number);
    } else {
        const d = new Date();
        startYear = d.getFullYear();
        startMonth = d.getMonth() + 1; // 1-indexed
    }
    
    const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    return Math.max(1, months);
}
