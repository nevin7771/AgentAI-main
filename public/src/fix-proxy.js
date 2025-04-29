// A script to test the proxy connection

(async function() {
  try {
    console.log("Testing proxy connection to server...");
    
    // Test connection to backend through proxy
    const response = await fetch('/api/ping', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log("Server responded:", data);
    } else {
      console.error("Failed to connect to server through proxy");
    }
  } catch (error) {
    console.error("Error testing proxy:", error);
  }
})();