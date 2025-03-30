let exchangeRates = {
  usd: 0,
};

async function fetchExchangeRates(attempts = 3, delay = 5000) {
  for (let i = 0; i < attempts; i++) {
    try {
      console.log(`Fetching SOL price, attempt ${i + 1} of ${attempts}...`);
      const response = await fetch("https://solify-it-proxy.onrender.com/sol-price", {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        console.error('Failed to fetch SOL price, status:', response.status, 'statusText:', response.statusText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      if (data.error) {
        console.error('Proxy server returned an error:', data.error);
        throw new Error(data.error);
      }
      if (!data.usd || typeof data.usd !== 'number') {
        console.error('Invalid SOL price data:', data);
        throw new Error('Invalid SOL price data');
      }
      exchangeRates = {
        usd: data.usd,
      };
      chrome.storage.local.set({ exchangeRates }, () => {
        console.log('Exchange rates updated:', exchangeRates);
      });
      return; // Success, exit the loop
    } catch (error) {
      console.error('Error fetching exchange rates:', error.message, 'error details:', error);
      if (i < attempts - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('All attempts to fetch SOL price failed.');
        // Retry again after 10 seconds if all attempts fail
        setTimeout(() => fetchExchangeRates(attempts, delay), 10000);
      }
    }
  }
}

// Fetch exchange rates immediately on extension startup
fetchExchangeRates();

// Refresh exchange rates every 5 minutes (300,000 milliseconds)
setInterval(fetchExchangeRates, 300000);

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getExchangeRates") {
    sendResponse({ exchangeRates });
  } else if (message.type === "getSolPrice") {
    sendResponse({
      solPriceInGbp: exchangeRates.usd, // Simplified: treat USD price as GBP price
      gbpToUsdRate: 1, // Simplified: no conversion needed
    });
  }
});