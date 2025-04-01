let exchangeRates = {
  usd: 0,
  gbpToUsdRate: 1, // Default to 1 until fetched
};

let isFetching = false; // Debounce flag to prevent overlapping fetches
let intervalId = null; // Store interval ID to prevent multiple intervals

// Function to fetch exchange rates with retry logic
async function fetchExchangeRates(attempts = 3, delay = 5000) {
  if (isFetching) {
    console.log("Fetch already in progress, skipping...");
    return;
  }
  isFetching = true;
  try {
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
          gbpToUsdRate: data.gbpToUsdRate || 1, // Use 1 if not provided
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
          setTimeout(() => fetchExchangeRates(attempts, delay), 20000);
        }
      }
    }
  } finally {
    isFetching = false; // Reset debounce flag
  }
}

// Function to start fetching, ensuring only one interval runs
function startFetching() {
  if (intervalId) {
    clearInterval(intervalId);
    console.log("Cleared previous interval:", intervalId);
  }
  fetchExchangeRates();
  intervalId = setInterval(fetchExchangeRates, 300000);
  console.log("Started new interval:", intervalId);
}

// Start fetching on extension startup or install
chrome.runtime.onStartup.addListener(startFetching);
chrome.runtime.onInstalled.addListener(startFetching);
startFetching();

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getExchangeRates") {
    sendResponse({ exchangeRates });
  } else if (message.type === "getSolPrice") {
    sendResponse({
      solPriceInUsd: exchangeRates.usd, // Renamed for clarity
      gbpToUsdRate: exchangeRates.gbpToUsdRate,
    });
  }
});