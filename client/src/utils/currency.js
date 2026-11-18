/**
 * NEXNUV Recruitment — Centralized Currency & Exchange Rate Utility
 *
 * Implements standard Indian Rupee (INR / ₹) display formatting,
 * centralized exchange rate conversion for historical USD records,
 * and caching of benchmark rates without altering stored database values.
 */

// Centralized Exchange Rate Benchmark Cache
const exchangeRateCache = {
  rates: {
    USD_INR: 86.50, // Reference rate: 1 USD = 86.50 INR
    INR_USD: 1 / 86.50
  },
  source: 'RBI / Interbank Benchmark',
  asOf: '2026-11-17',
  lastUpdated: Date.now()
};

/**
 * Returns current exchange rate metadata
 */
export function getExchangeRateMeta(from = 'USD', to = 'INR') {
  const pair = `${from.toUpperCase()}_${to.toUpperCase()}`;
  return {
    pair,
    rate: exchangeRateCache.rates[pair] || 86.50,
    source: exchangeRateCache.source,
    asOf: exchangeRateCache.asOf,
    lastUpdated: exchangeRateCache.lastUpdated
  };
}

/**
 * Converts a given amount from one currency to another using cached benchmark rates.
 * Does not mutate the source amount.
 */
export function convertCurrency(amount, fromCurrency = 'USD', toCurrency = 'INR') {
  const num = Number(amount) || 0;
  const from = String(fromCurrency || 'INR').toUpperCase();
  const to = String(toCurrency || 'INR').toUpperCase();

  if (from === to) return num;

  const pair = `${from}_${to}`;
  const rate = exchangeRateCache.rates[pair];
  if (rate) {
    return num * rate;
  }

  // Fallback if inverse exists
  const inversePair = `${to}_${from}`;
  const inverseRate = exchangeRateCache.rates[inversePair];
  if (inverseRate) {
    return num / inverseRate;
  }

  return num;
}

/**
 * Formats a numeric value into standard Indian Numbering system (e.g., ₹999.00, ₹9,999.00, ₹1,00,000.00, ₹10,00,000.00).
 *
 * @param {number|string} amount Amount in Rupees (not paise)
 * @param {object} options
 * @param {boolean} options.showSymbol Whether to prepend ₹ (default: true)
 * @param {number} options.minimumFractionDigits Min decimals (default: 2)
 * @param {number} options.maximumFractionDigits Max decimals (default: 2)
 */
export function formatINR(amount, options = {}) {
  const num = Number(amount) || 0;
  const {
    showSymbol = true,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
  } = options;

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(num);

  return showSymbol ? `₹${formatted}` : formatted;
}

/**
 * Formats monetary amounts stored as integer cents / paise (1 unit = 100 sub-units).
 *
 * Safety Rule:
 * - If currency is 'INR', amountCents represents paise -> divides by 100 and formats as ₹.
 * - If currency is 'USD', amountCents represents USD cents -> preserves original $ amount,
 *   converts to approximate INR equivalent, and displays clear labeling for financial auditability.
 *
 * @param {number} amountCents Integer cents/paise
 * @param {string} currency 'INR' | 'USD'
 * @param {object} options
 * @param {boolean} options.showOriginalForConverted If true, shows original USD in label
 */
export function formatAmountCents(amountCents, currency = 'INR', options = {}) {
  const cents = Number(amountCents) || 0;
  const curr = String(currency || 'INR').toUpperCase();
  const { showOriginalForConverted = true } = options;

  if (curr === 'INR') {
    const rupees = cents / 100;
    return formatINR(rupees, options);
  }

  if (curr === 'USD') {
    const originalUsd = cents / 100;
    const approxInr = convertCurrency(originalUsd, 'USD', 'INR');
    const inrFormatted = formatINR(approxInr, options);

    if (showOriginalForConverted) {
      return `${inrFormatted} (approx. $${originalUsd.toFixed(2)})`;
    }
    return inrFormatted;
  }

  // Any other currency fallback
  return `${formatINR(cents / 100, { showSymbol: false })} ${curr}`;
}

/**
 * Formats a subscription plan price in INR.
 * If plan price was originally configured in USD, converts to INR equivalent.
 *
 * @param {number|string} price Base price (in main currency units, e.g. 1999)
 * @param {string} billingCycle 'monthly' | 'yearly' | 'annual'
 * @param {string} currency 'INR' | 'USD'
 */
export function formatPlanPrice(price, billingCycle = '', currency = 'INR') {
  const num = Number(price) || 0;
  const curr = String(currency || 'INR').toUpperCase();
  const cycleSuffix = billingCycle
    ? ` / ${billingCycle.toLowerCase() === 'annual' || billingCycle.toLowerCase() === 'yearly' ? 'year' : 'month'}`
    : '';

  if (curr === 'INR') {
    return `${formatINR(num)}${cycleSuffix}`;
  }

  // Converted from USD
  const inrEquivalent = convertCurrency(num, 'USD', 'INR');
  return `${formatINR(inrEquivalent)}${cycleSuffix} (approx. $${num.toLocaleString()})`;
}

export default {
  formatINR,
  formatAmountCents,
  formatPlanPrice,
  convertCurrency,
  getExchangeRateMeta
};
