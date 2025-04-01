// Ensure the script runs only in the correct context
if (typeof document === "undefined" || !document.addEventListener) {
  console.error("Popup script running in an invalid context, aborting.");
} else {
  // Wait for the DOM to be fully loaded
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
        // Check if the extension context is still valid
        if (!chrome.runtime || !chrome.runtime.id) {
          console.error("Extension context invalidated, cannot fetch SOL price.");
          solPriceElement.textContent = "Price unavailable";
          resolve();
          return;
        }

        chrome.runtime.sendMessage({ type: "getExchangeRates" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error fetching SOL price:", chrome.runtime.lastError.message);
            solPriceElement.textContent = "Price unavailable";
            resolve();
            return;
          }

          if (response && response.exchangeRates && response.exchangeRates.usd > 0) {
            const price = response.exchangeRates.usd;
            solPriceElement.textContent = `$${price.toFixed(2)}`;
            console.log("SOL price updated in popup:", price);
            resolve();
          } else {
            console.error("Failed to fetch SOL price, response:", response);
            solPriceElement.textContent = "Price unavailable";
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

    // Function to check if the content script is ready in the tab
    function checkContentScriptReady(tabId) {
      return new Promise((resolve, reject) => {
        if (!chrome.runtime || !chrome.runtime.id) {
          reject(new Error("Extension context invalidated"));
          return;
        }

        chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.status === "pong") {
            resolve(true);
          } else {
            reject(new Error("Content script not responding"));
          }
        });
      });
    }

    // Function to send toggle message with retry
    async function sendToggleMessage(tabId, message, retries = 3, delay = 500) {
      console.log(`Attempting to send message to tab ${tabId}:`, message);

      // First, check if the content script is ready
      try {
        await checkContentScriptReady(tabId);
        console.log("Content script is ready in tab", tabId);
      } catch (error) {
        console.error("Content script not ready:", error.message);
        showError("Please refresh the page or open a supported webpage");
        return;
      }

      // Proceed with sending the toggle message
      const trySendMessage = (attempt) => {
        return new Promise((resolve, reject) => {
          if (!chrome.runtime || !chrome.runtime.id) {
            reject(new Error("Extension context invalidated"));
            return;
          }

          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              console.error(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
              if (attempt > 1) {
                console.log(`Retrying message send (${attempt - 1} attempts left)...`);
                setTimeout(() => {
                  trySendMessage(attempt - 1).then(resolve).catch(reject);
                }, delay);
              } else {
                reject(new Error("Failed to send message after retries"));
              }
            } else {
              console.log("Message sent successfully, response:", response);
              resolve(response);
            }
          });
        });
      };

      try {
        await trySendMessage(retries);
        // Update button color based on the new state
        if (message.isEnabled) {
          toggleButton.classList.add("enabled");
        } else {
          toggleButton.classList.remove("enabled");
        }
      } catch (error) {
        console.error("Error sending message to the content script after retries:", error.message);
        showError("Please refresh the page or open a supported webpage");
      }
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
              const tabUrl = tabs[0].url || "";
              // Expanded check for restricted pages
              if (
                tabUrl.startsWith("chrome://") ||
                tabUrl.startsWith("chrome-extension://") ||
                tabUrl.startsWith("about:") ||
                tabUrl.startsWith("file://") ||
                tabUrl === "" ||
                tabUrl === "about:blank" ||
                tabUrl.includes("chrome-extension://") ||
                tabUrl.includes("chrome.google.com/webstore") ||
                tabUrl.includes("edge://")
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
}