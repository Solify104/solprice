document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("toggleButton");
  const errorText = document.getElementById("errorText");
  const solPriceElement = document.getElementById("solPrice");

  // Check if DOM elements exist
  if (!toggleButton || !errorText || !solPriceElement) {
    console.error("One or more DOM elements are missing in popup.html:", {
      toggleButton,
      errorText,
      solPriceElement,
    });
    return;
  }

  // Function to fetch the live SOL price from the background script
  async function fetchSolPrice() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "getExchangeRates" }, (response) => {
        if (response && response.exchangeRates && response.exchangeRates.usd > 0) {
          const price = response.exchangeRates.usd;
          solPriceElement.textContent = `$${price.toFixed(2)}`;
          console.log("SOL price updated in popup:", price);
          resolve();
        } else {
          console.error("Failed to fetch SOL price, response:", response);
          solPriceElement.textContent = "Price unavailable";
          // Retry after 5 seconds if the price is unavailable
          setTimeout(fetchSolPrice, 5000);
          resolve();
        }
      });
    });
  }

  // Fetch the price immediately when the popup loads
  fetchSolPrice();

  // Refresh the price every 30 seconds
  setInterval(fetchSolPrice, 30000);

  // Load the current state from storage
  chrome.storage.local.get("isEnabled", (data) => {
    const isEnabled = data.isEnabled || false;
    // Update button color based on state
    if (isEnabled) {
      toggleButton.classList.add("enabled");
    } else {
      toggleButton.classList.remove("enabled");
    }
  });

  // Function to show error messages
  function showError(message) {
    errorText.textContent = message;
    errorText.style.display = "block";
    setTimeout(() => {
      errorText.style.display = "none";
    }, 5000);
  }

  // Function to send toggle message with retry
  function sendToggleMessage(tabId, message, retries = 3, delay = 500) {
    console.log(`Attempting to send message to tab ${tabId}:`, message);
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
        if (retries > 0) {
          console.log(`Retrying message send (${retries} attempts left)...`);
          setTimeout(() => sendToggleMessage(tabId, message, retries - 1, delay), delay);
        } else {
          console.error("Error sending message to the content script after retries");
          showError("Please refresh the page");
        }
      } else {
        console.log("Message sent successfully, response:", response);
        // Update button color based on the new state
        if (message.isEnabled) {
          toggleButton.classList.add("enabled");
        } else {
          toggleButton.classList.remove("enabled");
        }
      }
    });
  }

  // Toggle button click handler
  toggleButton.addEventListener("click", () => {
    chrome.storage.local.get("isEnabled", (data) => {
      const isEnabled = data.isEnabled || false;
      const newState = !isEnabled;

      // Save the new state
      chrome.storage.local.set({ isEnabled: newState }, () => {
        console.log("State saved:", newState);

        // Send toggle message to the content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            const tabUrl = tabs[0].url;
            // Check if the tab URL is a restricted page
            if (
              tabUrl.startsWith("chrome://") ||
              tabUrl.startsWith("chrome-extension://") ||
              tabUrl.startsWith("about:") ||
              tabUrl.startsWith("file://") ||
              tabUrl === ""
            ) {
              showError("Cannot run on this page");
              return;
            }
            sendToggleMessage(tabs[0].id, { type: "toggleState", isEnabled: newState });
          } else {
            showError("No active tab found");
          }
        });
      });
    });
  });
});