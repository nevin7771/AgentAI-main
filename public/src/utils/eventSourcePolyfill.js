class EventSourcePolyfill {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;

    this.pollInterval = options.pollInterval || 1000;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.shouldReconnect = options.reconnect !== false;

    this.lastEventId = "";
    this.isPolling = false;
    this.abortController = null;

    this._connect();
  }

  _connect() {
    this.readyState = 0; // CONNECTING
    this.abortController = new AbortController();

    const headers = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      ...this.options.headers,
    };

    if (this.lastEventId) {
      headers["Last-Event-ID"] = this.lastEventId;
    }

    const fetchOptions = {
      method: this.options.method || "GET",
      headers,
      credentials: this.options.credentials || "same-origin",
      signal: this.abortController.signal,
    };

    // Add body for POST requests
    if (fetchOptions.method === "POST" && this.options.body) {
      fetchOptions.body =
        typeof this.options.body === "string"
          ? this.options.body
          : JSON.stringify(this.options.body);
    }

    fetch(this.url, fetchOptions)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        this.readyState = 1; // OPEN
        if (this.onopen) {
          this.onopen({ type: "open" });
        }

        // Create reader and decoder for streaming
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processStream = () => {
          return reader
            .read()
            .then(({ value, done }) => {
              if (done) {
                console.log("Stream ended naturally");

                // Process any remaining data in the buffer
                if (buffer.trim()) {
                  this._processEventStream(buffer);
                }

                this.readyState = 2; // CLOSED
                if (this.onclose) {
                  this.onclose({ type: "close" });
                }

                // Reconnect if needed
                if (this.shouldReconnect) {
                  setTimeout(() => this._connect(), this.reconnectInterval);
                }

                return;
              }

              // Decode chunk and add to buffer
              buffer += decoder.decode(value, { stream: true });

              // Process complete events in buffer
              // Split by double newlines which is the SSE event separator
              let processedBuffer = "";
              const events = buffer.split("\n\n");

              // Process all complete events (all but the last one)
              if (events.length > 1) {
                for (let i = 0; i < events.length - 1; i++) {
                  const event = events[i];
                  if (event.trim()) {
                    this._processEvent(event);
                  }
                }

                // Keep the last event (which might be incomplete) in the buffer
                buffer = events[events.length - 1];
              }

              // Continue reading
              return processStream();
            })
            .catch((err) => {
              console.error("Error reading stream:", err);
              this._dispatchError(err);

              this.readyState = 2; // CLOSED
              if (this.onclose) {
                this.onclose({ type: "close" });
              }

              // Reconnect if needed
              if (this.shouldReconnect) {
                setTimeout(() => this._connect(), this.reconnectInterval);
              }
            });
        };

        return processStream();
      })
      .catch((err) => {
        console.error("EventSource fetch error:", err);
        this._dispatchError(err);

        this.readyState = 2; // CLOSED
        if (this.onclose) {
          this.onclose({ type: "close" });
        }

        // Reconnect if needed
        if (this.shouldReconnect) {
          setTimeout(() => this._connect(), this.reconnectInterval);
        }
      });
  }

  // Process a single SSE event
  _processEvent(eventString) {
    const lines = eventString.split("\n");
    let event = {
      data: "",
      type: "message",
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue; // Skip empty lines

      // Handle double "data:" prefix that can appear in broken streams
      if (line.startsWith("data:data:")) {
        event.data = line.substring(10);
      }
      // Regular data line
      else if (line.startsWith("data:")) {
        event.data = line.substring(5);
      }
      // Event type
      else if (line.startsWith("event:")) {
        event.type = line.substring(6);
      }
      // ID
      else if (line.startsWith("id:")) {
        event.id = line.substring(3);
        this.lastEventId = event.id;
      }
      // Retry
      else if (line.startsWith("retry:")) {
        const retry = parseInt(line.substring(6), 10);
        if (!isNaN(retry)) {
          this.reconnectInterval = retry;
        }
      }
      // Unknown field - add the whole line
      else {
        event.data = line;
      }
    }

    // Dispatch event
    if (event.data) {
      this._dispatchEvent(event);
    }
  }

  // Process the SSE event stream
  _processEventStream(eventsString) {
    // Split multiple events by double newline
    const events = eventsString.split("\n\n");

    for (let i = 0; i < events.length; i++) {
      const event = events[i].trim();
      if (event) {
        this._processEvent(event);
      }
    }
  }

  _dispatchEvent(event) {
    if (this.onmessage) {
      const messageEvent = {
        type: event.type || "message",
        data: event.data,
        lastEventId: this.lastEventId,
      };
      this.onmessage(messageEvent);
    }
  }

  _dispatchError(error) {
    if (this.onerror) {
      this.onerror({
        type: "error",
        error: error,
      });
    }
  }

  close() {
    if (this.readyState === 2) return; // Already closed

    if (this.abortController) {
      this.abortController.abort();
    }

    this.readyState = 2; // CLOSED
    this.shouldReconnect = false;

    if (this.onclose) {
      this.onclose({ type: "close" });
    }
  }
}

// Always use our polyfill
export default EventSourcePolyfill;
