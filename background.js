// Object to store the latest exchange rates
let exchangeRates = {
  usd: 0,
};

// Function to fetch SOL price in USD from the proxy server
async function fetchExchangeRates() {
  try {
    const response = await fetch("https://solify-it-proxy.onrender.com/sol-price");
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    exchangeRates = {
      usd: data.usd,
    };
    // Store the rates in chrome.storage.local
    chrome.storage.local.set({ exchangeRates }, () => {
      console.log("Exchange rates updated:", exchangeRates);
    });
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    // Retry after 10 seconds if the fetch fails
    setTimeout(fetchExchangeRates, 10000);
  }
}

// Fetch exchange rates immediately on extension startup
fetchExchangeRates();

// Refresh exchange rates every 5 minutes (300,000 milliseconds)
setInterval(fetchExchangeRates, 300000);

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getExchangeRates") {
    // Send the latest exchange rates
    sendResponse({ exchangeRates });
  } else if (message.type === "getSolPrice") {
    // For compatibility with content.js, which expects solPriceInGbp and gbpToUsdRate
    // Since we're only using USD now, we'll mock these values
    // Assuming content.js converts everything to GBP internally, we can set gbpToUsdRate to 1
    // and solPriceInGbp to the USD price (this is a simplification since we're not fetching GBP)
    sendResponse({
      solPriceInGbp: exchangeRates.usd, // Simplified: treat USD price as GBP price
      gbpToUsdRate: 1, // Simplified: no conversion needed
    });
  }
});