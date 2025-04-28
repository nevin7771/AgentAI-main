# Testing Pinecone Integration

This document provides instructions for testing the Pinecone vector database integration used for RAG (Retrieval-Augmented Generation) capabilities in the Agent AI application.

## Prerequisites

1. Create a Pinecone account at [https://www.pinecone.io/](https://www.pinecone.io/)
2. Create an API key in your Pinecone dashboard
3. Install the required dependencies with `npm install`

## Setup Environment Variables

1. Create a `.env` file in the `/server` directory based on the provided `.env.example`
2. Add your Pinecone API key:
   ```
   PINECONE_API_KEY=your_pinecone_api_key_here
   ```
3. Also add your OpenAI API key, which is used for generating embeddings:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

## Running the Test

1. Navigate to the `server` directory:
   ```bash
   cd /Users/naveenkumar/Downloads/AgentAI-main/server
   ```

2. Run the test script:
   ```bash
   node test-pinecone.js
   ```

3. Check the console output for test results. A successful test will create a test index in Pinecone, generate an embedding, store it, and then retrieve it.

## Expected Output

A successful test should show output similar to:

```
Starting Pinecone integration test...
Make sure you have PINECONE_API_KEY in your .env file
1. Testing Pinecone initialization...
✅ Pinecone client initialized successfully

2. Testing index creation or validation...
✅ Index created or already exists

3. Testing index retrieval...
✅ Successfully retrieved index: test-index

4. Testing embedding generation and upsert...
✅ Generated test embedding
✅ Successfully upserted test embedding

5. Testing similarity search...
✅ Successfully queried for similar vectors
Found 1 similar vectors

Top result:
- ID: query_[timestamp]_[random]
- Score: 0.999999
- Metadata: {
  "text": "This is a test query for Pinecone vector database",
  "type": "query",
  "timestamp": "2023-XX-YYTH:MM:SS.SSSZ"
}

✅ All Pinecone tests passed successfully!
```

## Troubleshooting

1. **Initialization Error**: If you see an error about "PINECONE_API_KEY not found", make sure your `.env` file has the correct key and is in the right location.

2. **Authentication Error**: If you see errors like "Invalid API key", double-check your Pinecone API key in the dashboard.

3. **Index Creation Issues**: The serverless Pinecone index creation may take some time. The test script waits 30 seconds, but you might need to wait longer for the first run.

4. **Embedding Generation Errors**: If you see errors about "OPENAI_API_KEY", ensure your OpenAI API key is correctly set in the `.env` file.

## Implementation Details

The Pinecone integration consists of several components:

1. `pineconeClient.js` - Handles connecting to Pinecone, creating indexes, and vector operations
2. `embeddingsService.js` - Generates text embeddings using OpenAI
3. `ragSearchService.js` - Uses Pinecone and embeddings for searching and retrieving data

These components work together to provide RAG capabilities, allowing the application to store and retrieve information based on semantic similarity.