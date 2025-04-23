// server/rag/vector/embeddingsService.js
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

let openaiClient = null;

/**
 * Initialize the OpenAI client
 * @returns {OpenAI} - Initialized OpenAI client
 */
const getOpenAIClient = () => {
  if (openaiClient) return openaiClient;
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }
  
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
};

/**
 * Generate text embeddings using OpenAI API
 * @param {string|string[]} texts - A string or array of strings to embed
 * @param {string} model - The embedding model to use
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export const generateEmbeddings = async (texts, model = 'text-embedding-ada-002') => {
  const openai = getOpenAIClient();
  
  // Ensure texts is an array
  const textArray = Array.isArray(texts) ? texts : [texts];
  
  try {
    const response = await openai.embeddings.create({
      model,
      input: textArray,
    });
    
    // Extract the embedding vectors
    const embeddings = response.data.map(item => item.embedding);
    return embeddings;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
};

/**
 * Process a search query into chunks and generate embeddings
 * @param {string} query - The search query
 * @param {object} metadata - Additional metadata to store with the embedding
 * @returns {Promise<{id: string, values: number[], metadata: object}>} - Embedding object ready for vector DB
 */
export const processQueryEmbedding = async (query, metadata = {}) => {
  try {
    // Generate embeddings for the query
    const [embedding] = await generateEmbeddings(query);
    
    // Create a unique ID for the query
    const id = `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    return {
      id,
      values: embedding,
      metadata: {
        text: query,
        type: 'query',
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  } catch (error) {
    console.error('Error processing query embedding:', error);
    throw error;
  }
};

/**
 * Process a search result for storage in vector database
 * @param {string} content - The content to embed
 * @param {object} metadata - Additional metadata to store
 * @returns {Promise<{id: string, values: number[], metadata: object}>} - Embedding object ready for vector DB
 */
export const processResultEmbedding = async (content, metadata = {}) => {
  try {
    // Truncate content if it's too long (OpenAI has token limits)
    const truncatedContent = content.length > 8000 
      ? content.substring(0, 8000) 
      : content;
    
    // Generate embeddings for the content
    const [embedding] = await generateEmbeddings(truncatedContent);
    
    // Create a unique ID for the content
    const id = `result_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    return {
      id,
      values: embedding,
      metadata: {
        text: truncatedContent,
        type: 'result',
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  } catch (error) {
    console.error('Error processing result embedding:', error);
    throw error;
  }
};

export default {
  generateEmbeddings,
  processQueryEmbedding,
  processResultEmbedding
};