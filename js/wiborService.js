export const FALLBACK_WIBOR = {
    '1M': { value: 3.82, date: '2026-05-22', isFallback: true },
    '3M': { value: 3.86, date: '2026-05-22', isFallback: true },
    '6M': { value: 3.95, date: '2026-05-22', isFallback: true }
};

export async function fetchWiborRates() {
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
