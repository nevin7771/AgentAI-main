// server/test-pinecone.js
import { 
  initPinecone, 
  getPineconeIndex, 
  createPineconeIndex, 
  upsertEmbeddings, 
  querySimilar 
} from './rag/vector/pineconeClient.js';
import { processQueryEmbedding } from './rag/vector/embeddingsService.js';
import dotenv from 'dotenv';

dotenv.config();

// Test Pinecone connection and functionality
const testPineconeConnection = async () => {
  try {
    console.log('1. Testing Pinecone initialization...');
    const pinecone = await initPinecone();
    console.log('✅ Pinecone client initialized successfully');
    
    // Create a test index if it doesn't exist
    console.log('\n2. Testing index creation or validation...');
    const indexName = 'test-index';
    await createPineconeIndex(indexName, 1536);
    console.log('✅ Index created or already exists');
    
    // Get the index
    console.log('\n3. Testing index retrieval...');
    const index = await getPineconeIndex(indexName);
    console.log('✅ Successfully retrieved index:', indexName);
    
    // Create a test embedding
    console.log('\n4. Testing embedding generation and upsert...');
    const testQuery = 'This is a test query for Pinecone vector database';
    const queryEmbedding = await processQueryEmbedding(testQuery);
    console.log('✅ Generated test embedding');
    
    // Upsert the embedding
    await upsertEmbeddings(indexName, [queryEmbedding]);
    console.log('✅ Successfully upserted test embedding');
    
    // Query for similar vectors
    console.log('\n5. Testing similarity search...');
    const results = await querySimilar(indexName, queryEmbedding.values, 3);
    console.log('✅ Successfully queried for similar vectors');
    console.log(`Found ${results.length} similar vectors`);
    
    if (results.length > 0) {
      console.log('\nTop result:');
      console.log('- ID:', results[0].id);
      console.log('- Score:', results[0].score);
      console.log('- Metadata:', JSON.stringify(results[0].metadata, null, 2));
    }
    
    console.log('\n✅ All Pinecone tests passed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Pinecone test failed:', error);
    return false;
  }
};

// Run the test
console.log('Starting Pinecone integration test...');
console.log('Make sure you have PINECONE_API_KEY in your .env file');
testPineconeConnection();