// server/test-agent-connection.js
import axios from 'axios';
import jwt from 'jsonwebtoken';

// Create a function to generate a JWT token
const generateToken = () => {
  // Get current time in seconds (UTC)
  const now = Math.floor(Date.now() / 1000);
  
  // Expiry time (30 minutes from now)
  const exp = now + 30 * 60;
  
  // Standard JWT payload
  const payload = {
    iss: "yana.bao+AIStudio+DG01@test.zoom.us",
    aud: "zoom_caic",
    aid: "3v8eT3vkQ1-PBQnN61MJog",
    uid: "NhiGO2feQEORV5Loghzx_Q",
    iat: now,
    exp: exp,
  };
  
  // Secret key
  const SECRET_KEY = "gzazjvdts768lelcbcyy5ecpkiguthmq";
  
  // Generate token
  return jwt.sign(payload, SECRET_KEY, { algorithm: "HS256" });
};

// Test connection to agent API with various endpoints
const testAgentConnection = async () => {
  // Generate token
  const token = generateToken();
  console.log('Generated token:', token);
  
  // API URL variants to try
  const urlVariants = [
    // Variant 1 - Original URL
    'https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw/conf_ag',
    // Variant 2 - Without ID
    'https://dg01ai.zoom.us/open/api/v1/caic/general-ai/conf_ag', 
    // Variant 3 - With skillSettingId parameter
    'https://dg01ai.zoom.us/open/api/v1/caic/general-ai?skillSettingId=conf_ag',
    // Variant 4 - With skillSettingId parameter and base ID
    'https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=conf_ag',
  ];
  
  // Request payload
  const payload = {
    question: "What is a 104201 error?",
    chat_history: []
  };
  
  // Try each variant
  for (const url of urlVariants) {
    try {
      console.log('\n---------------------------------------');
      console.log('Trying URL:', url);
      console.log('With payload:', payload);
      
      // Make API request
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      });
      
      console.log('SUCCESS! Response status:', response.status);
      console.log('Response data:', response.data);
      
      // If successful, get the task ID
      if (response.data && response.data.body && response.data.body.taskId) {
        const taskId = response.data.body.taskId;
        console.log('Task ID:', taskId);
        
        // Wait a few seconds for processing
        console.log('Waiting 5 seconds before checking result...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get task result
        console.log('Checking task result...');
        const resultResponse = await axios.get(url, {
          params: { taskId },
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log('Result status:', resultResponse.status);
        console.log('Result data:', resultResponse.data);
        
        // Found a working URL, record for use
        console.log('\n*** FOUND WORKING URL AND PARAMETERS! ***');
        console.log('Working URL:', url);
        console.log('With authorization token and payload as shown above');
        break;
      }
    } catch (error) {
      console.error('Error with URL', url);
      console.error('Message:', error.message);
      
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
    }
  }
};

// Run the test
console.log('Testing agent connection with multiple URL variants...');
testAgentConnection();