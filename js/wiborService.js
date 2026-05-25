export const FALLBACK_WIBOR = {
    '1M': { value: 3.82, date: '2026-05-22', isFallback: true },
    '3M': { value: 3.86, date: '2026-05-22', isFallback: true },
    '6M': { value: 3.95, date: '2026-05-22', isFallback: true }
};

export async function fetchWiborRates() {
    const proxyUrls = [
        (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
        (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`
    ];
    
    const targetUrl = 'https://gpwbenchmark.pl/';
    let htmlContent = '';
    let success = false;
    let usingProxy = '';

    // Attempt to fetch via proxies sequentially
    for (const getProxyUrl of proxyUrls) {
        try {
            const requestUrl = getProxyUrl(targetUrl);
            const response = await fetch(requestUrl);
            if (!response.ok) continue;
            
            if (requestUrl.includes('allorigins')) {
                const data = await response.json();
                htmlContent = data.contents;
            } else {
                htmlContent = await response.text();
            }
            
            if (htmlContent && htmlContent.includes('WIBOR')) {
                success = true;
                usingProxy = requestUrl;
                break;
            }
        } catch (error) {
            console.warn('WIBOR fetch failed using proxy, trying next...', error);
        }
    }

    if (!success) {
        console.warn('All proxies failed to fetch WIBOR. Using fallback data.');
        return {
            rates: FALLBACK_WIBOR,
            success: false,
            message: 'Nie udało się pobrać aktualnych stawek. Użyto ostatnich dostępnych z 22.05.2026 r.'
        };
    }

    try {
        const rates = parseWiborHtml(htmlContent);
        if (Object.keys(rates).length === 0) {
            throw new Error('Parsed 0 rates from HTML');
        }
        return {
            rates: {
                '1M': rates['1M'] || FALLBACK_WIBOR['1M'],
                '3M': rates['3M'] || FALLBACK_WIBOR['3M'],
                '6M': rates['6M'] || FALLBACK_WIBOR['6M']
            },
            success: true,
            message: `Pomyślnie pobrano stawki WIBOR z dnia ${rates['3M']?.date || 'dzisiejszego'}.`
        };
    } catch (parseError) {
        console.error('Failed to parse WIBOR HTML content:', parseError);
        return {
            rates: FALLBACK_WIBOR,
            success: false,
            message: 'Błąd podczas przetwarzania danych. Użyto stawek zapasowych.'
        };
    }
}

function parseWiborHtml(html) {
    const rates = {};
    
    // Clean up HTML comments and extra whitespace to make regex matching reliable
    const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
    
    // Regex for matching GPW Benchmark's table row structure:
    // <td>1M</td>
    // <td>3,62%</td>
    // <td>3,82%</td>
    // <td>2026-05-22</td>
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
