// server/rag/vector/pineconeClient.js
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Pinecone client
let pineconeClient = null;

/**
 * Initialize the Pinecone client
 * @returns {Promise<Pinecone>} - Initialized Pinecone client
 */
export const initPinecone = async () => {
  if (pineconeClient) return pineconeClient;

  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY not found in environment variables');
  }

  pineconeClient = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  return pineconeClient;
};

/**
 * Get the Pinecone index
 * @param {string} indexName - The name of the index
 * @returns {Promise<any>} - The Pinecone index
 */
export const getPineconeIndex = async (indexName = 'agent-ai-searches') => {
  const pinecone = await initPinecone();
  return pinecone.index(indexName); // lowercase 'index' in the newer SDK
};

/**
 * Create a new Pinecone index if it doesn't exist
 * @param {string} indexName - The name of the index
 * @param {number} dimensions - The number of dimensions for the embeddings
 * @returns {Promise<void>}
 */
export const createPineconeIndex = async (indexName = 'agent-ai-searches', dimensions = 1536) => {
  try {
    const pinecone = await initPinecone();
    
    // Check if the index already exists
    const indexList = await pinecone.listIndexes();
    const existingIndexes = indexList.indexes || [];
    
    // Check if our index exists in the list
    if (!existingIndexes.some(index => index.name === indexName)) {
      console.log(`Creating index ${indexName}...`);
      await pinecone.createIndex({
        name: indexName,
        dimension: dimensions,
        metric: 'cosine',
        spec: {
          serverless: {
            region: 'aws:us-east-1'  // Using the full region format as required
          }
        }
      });
      
      // Wait for index to be created
      console.log(`Waiting for index ${indexName} to be initialized...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    } else {
      console.log(`Index ${indexName} already exists`);
    }
  } catch (error) {
    console.error('Error creating Pinecone index:', error);
    throw error;
  }
};

/**
 * Upsert embeddings into Pinecone
 * @param {string} indexName - The name of the index
 * @param {Array<{id: string, values: number[], metadata: object}>} embeddings - Array of embeddings to insert
 */
export const upsertEmbeddings = async (indexName, embeddings) => {
  try {
    const index = await getPineconeIndex(indexName);
    
    // Batch upserts for more efficiency
    const batchSize = 100;
    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize);
      
      // Format vectors for newer Pinecone API
      const vectors = batch.map(item => ({
        id: item.id,
        values: item.values,
        metadata: item.metadata
      }));
      
      await index.upsert(vectors);
    }
    
    console.log(`Upserted ${embeddings.length} embeddings into ${indexName}`);
  } catch (error) {
    console.error('Error upserting embeddings:', error);
    throw error;
  }
};

/**
 * Query the Pinecone index for similar vectors
 * @param {string} indexName - The name of the index
 * @param {number[]} vector - The query vector
 * @param {number} topK - Number of results to return
 * @param {object} filter - Optional metadata filter
 * @returns {Promise<Array>} - Array of matching documents with similarity scores
 */
export const querySimilar = async (indexName, vector, topK = 5, filter = {}) => {
  try {
    const index = await getPineconeIndex(indexName);
    
    const results = await index.query({
      vector,
      topK,
      includeMetadata: true,
      filter
    });
    
    return results.matches || [];
  } catch (error) {
    console.error('Error querying Pinecone:', error);
    throw error;
  }
};

export default {
  initPinecone,
  getPineconeIndex,
  createPineconeIndex,
  upsertEmbeddings,
  querySimilar
};