// server/agents/jira_agent/privacyVectorizer.js
import axios from "axios";
import { createHash } from "crypto";

/**
 * Privacy Vectorizer for PII protection
 * Uses semantic embeddings to protect sensitive information while preserving meaning
 */
class PrivacyVectorizer {
  constructor() {
    this.initialized = false;
    this.embeddingEndpoint =
      process.env.EMBEDDING_API_URL || "http://localhost:8080/embed";
    this.apiKey = process.env.EMBEDDING_API_KEY;

    // Patterns for identifying PII
    this.piiPatterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
      creditCard: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
      ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
      ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      name: /\b([A-Z][a-z]+\s[A-Z][a-z]+)\b/g, // Simplified name detection
    };

    // Sensitive words that might indicate PII
    this.sensitiveTerms = new Set([
      "password",
      "secret",
      "key",
      "token",
      "credential",
      "account",
      "username",
      "private",
      "confidential",
      "sensitive",
      "personal",
      "address",
      "birthday",
      "birth date",
      "social security",
      "ssn",
      "passport",
      "license",
      "id number",
    ]);

    console.log("[PrivacyVectorizer] PII protection system initialized");
  }

  /**
   * Initialize the vectorizer
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Test the embedding API connection
      if (this.embeddingEndpoint) {
        await axios.post(
          this.embeddingEndpoint,
          {
            texts: ["test"],
          },
          {
            headers: this.apiKey
              ? { Authorization: `Bearer ${this.apiKey}` }
              : {},
            timeout: 5000,
          }
        );
        console.log(
          "[PrivacyVectorizer] Successfully connected to embedding API"
        );
      }

      this.initialized = true;
    } catch (error) {
      console.warn(
        "[PrivacyVectorizer] Could not connect to embedding API:",
        error.message
      );
      console.warn(
        "[PrivacyVectorizer] Will fall back to hash-based PII protection"
      );
    }
  }

  /**
   * Convert text to a privacy-preserving representation
   * @param {string} text - The text to transform
   * @returns {object} - The privacy-preserving representation
   */
  async textToVectors(text) {
    await this.initialize();

    // Preserve Jira ticket IDs with placeholders
    const ticketIdRegex = /([A-Z]+-\d+)/g;
    const ticketIds = [];

    let processedText = text.replace(ticketIdRegex, (match) => {
      ticketIds.push(match);
      return `__TICKET_ID_${ticketIds.length - 1}__`;
    });

    // Identify PII matches
    const piiMatches = this.identifyPII(processedText);

    // Replace PII with placeholders
    const piiPlaceholders = [];
    for (const match of piiMatches) {
      piiPlaceholders.push(match.text);
      processedText = processedText.replace(
        match.text,
        `__PII_${piiPlaceholders.length - 1}__`
      );
    }

    // If embedding API is available, generate embeddings
    let embeddings = null;
    if (this.initialized && this.embeddingEndpoint) {
      try {
        const response = await axios.post(
          this.embeddingEndpoint,
          {
            texts: [processedText],
          },
          {
            headers: this.apiKey
              ? { Authorization: `Bearer ${this.apiKey}` }
              : {},
            timeout: 10000,
          }
        );

        embeddings = response.data.embeddings[0];
      } catch (error) {
        console.warn(
          "[PrivacyVectorizer] Error getting embeddings:",
          error.message
        );
      }
    }

    // Create result with all information needed to reconstruct (safe) text
    return {
      ticketIds,
      piiPlaceholders: piiPlaceholders.map(this.hashPII),
      processedText,
      embeddings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Convert privacy-preserving representation back to text
   * @param {object} vectorData - The privacy-preserving representation
   * @returns {string} - Reconstructed text with PII masked
   */
  async vectorsToText(vectorData) {
    if (!vectorData.processedText) {
      throw new Error("Invalid vector data format");
    }

    let reconstructedText = vectorData.processedText;

    // Replace ticket ID placeholders with actual ticket IDs
    if (vectorData.ticketIds) {
      vectorData.ticketIds.forEach((ticketId, index) => {
        reconstructedText = reconstructedText.replace(
          `__TICKET_ID_${index}__`,
          ticketId
        );
      });
    }

    // Replace PII placeholders with [PROTECTED] markers
    if (vectorData.piiPlaceholders) {
      vectorData.piiPlaceholders.forEach((_, index) => {
        reconstructedText = reconstructedText.replace(
          `__PII_${index}__`,
          "[PROTECTED]"
        );
      });
    }

    return reconstructedText;
  }

  /**
   * Identify PII in text
   * @param {string} text - The text to scan
   * @returns {Array} - Array of PII matches with type and position
   */
  identifyPII(text) {
    const matches = [];

    // Check each PII pattern
    for (const [type, pattern] of Object.entries(this.piiPatterns)) {
      let match;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(text)) !== null) {
        matches.push({
          type,
          text: match[0],
          index: match.index,
        });
      }
    }

    // Also check for sensitive terms
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\w]/g, "");
      if (this.sensitiveTerms.has(word)) {
        // Find the position of this word in original text
        const wordIndex = text
          .toLowerCase()
          .indexOf(
            word,
            i > 0 ? text.indexOf(words[i - 1]) + words[i - 1].length : 0
          );

        if (wordIndex >= 0) {
          matches.push({
            type: "sensitive_term",
            text: text.substring(wordIndex, wordIndex + word.length),
            index: wordIndex,
          });
        }
      }
    }

    // Sort by position in text
    return matches.sort((a, b) => a.index - b.index);
  }

  /**
   * Hash PII for storage (one-way transformation)
   * @param {string} text - PII text to hash
   * @returns {string} - Hashed representation
   */
  hashPII(text) {
    return createHash("sha256").update(text).digest("hex").substring(0, 16);
  }
}

export default new PrivacyVectorizer();
