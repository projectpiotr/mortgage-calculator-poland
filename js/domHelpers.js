/**
 * DOM Helper Utilities
 * Manages currency and date formatting, tables, modals, and dynamic HTML injection.
 */

/**
 * Formats a number to Polish currency format: e.g. "564.257,14 PLN"
 */
export function formatPLN(value) {
    if (value === undefined || value === null || isNaN(value)) return '0,00 PLN';
    
    // We format with two decimal places and replace non-breaking spaces with standard ones
    const formatted = new Intl.NumberFormat('pl-PL', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
    
    return `${formatted} PLN`.replace(/\s/g, ' ');
}

/**
 * Formats a Date object to Polish month/year format: e.g. "Czerwiec 2026"
 */
export function formatPolishMonth(date) {
    const months = [
        'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
        'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Formats a Date object to Polish full date style matching user screenshot: e.g. "25 Luty 2037"
 */
export function formatPolishDateLong(date) {
    const months = [
        'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
        'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Renders the paginated schedule table inside the DOM.
 * @param {HTMLTableSectionElement} tbody - Table body element
 * @param {Array} schedule - Amortization schedule array
 * @param {number} page - Current page index (1-indexed)
 * @param {number} pageSize - Rows per page
 * @param {Object} totalSums - Object containing sums of columns for footer
 * @param {Function} onAddOverpayment - Callback when clicking overpayment cell
 */
export function renderScheduleTable(tbody, schedule, page, pageSize, totalSums, onAddOverpayment) {
    tbody.innerHTML = '';
    
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, schedule.length);
    const paginatedItems = schedule.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">Brak danych. Wprowadź parametry kredytu.</td></tr>`;
        return;
    }

    // Render paginated data rows
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

        // Bind click event to overpayment badge
        const opBadge = tr.querySelector('.table-badge.overpayment');
        opBadge.addEventListener('click', () => {
            onAddOverpayment(row.nr, row.overpayment);
        });

        tbody.appendChild(tr);
    });

    // Add final "Suma" row at the bottom of the table (always visible regardless of page)
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

/**
 * Creates custom tooltips inside a container
 */
export function initTooltips() {
    // We clean up existing dynamic tooltips first
    const existing = document.querySelectorAll('.custom-tooltip-box');
    existing.forEach(e => e.remove());

    const tooltipElements = document.querySelectorAll('.has-tooltip');
    tooltipElements.forEach(el => {
        const text = el.getAttribute('data-tooltip');
        if (!text) return;

        // Add visual indicator if not present
        if (!el.querySelector('.tooltip-icon')) {
            const span = document.createElement('span');
            span.className = 'tooltip-icon';
            span.innerText = 'i';
            el.appendChild(span);
        }

        // Handle tooltip box on hover
        el.addEventListener('mouseenter', (e) => {
            const box = document.createElement('div');
            box.className = 'custom-tooltip-box';
            box.innerText = text;
            
            // Basic styling
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
            
            // Positioning relative to host element
            const rect = el.getBoundingClientRect();
            const boxRect = box.getBoundingClientRect();
            
            const top = window.scrollY + rect.top - boxRect.height - 8;
            const left = window.scrollX + rect.left + (rect.width / 2) - (box.offsetWidth / 2);
            
            box.style.top = `${top}px`;
            box.style.left = `${left}px`;
            
            // Trigger animation
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

/**
 * Displays a non-intrusive notification toast
 */
export function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Choose icon based on type
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="16" height="16" fill="var(--color-success)" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;
    } else if (type === 'warning') {
        iconSvg = `<svg width="16" height="16" fill="var(--color-warning)" viewBox="0 0 16 16"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}
