const fs = require('fs');
const path = require('path');

// 读取配置文件
const configPath = path.join(__dirname, './config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 提取OpenAI配置
const openaiConfig = config.openai;

console.log('Testing OpenAI connectivity...');
console.log('Configuration:');
console.log('- Provider:', openaiConfig.provider);
console.log('- Model:', openaiConfig.model);
console.log('- Base URL:', openaiConfig.base_url || openaiConfig.base_url);
console.log('- API Key:', openaiConfig.openai_api_key ? '***' + openaiConfig.openai_api_key.slice(-4) : 'Not set');

// 测试API连通性
async function testOpenAIConnectivity() {
  try {
    const baseUrl = openaiConfig.base_url || openaiConfig.base_url || 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const apiKey = openaiConfig.openai_api_key;
    
    if (!apiKey) {
      throw new Error('API key is not set');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: openaiConfig.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, test message!' }
        ],
        max_tokens: 50
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('\n✅ Connection successful!');
    console.log('Response received:');
    console.log('- Model:', data.model);
    console.log('- Usage:', data.usage);
    console.log('- Message:', data.choices[0].message.content.trim());

  } catch (error) {
    console.error('\n❌ Connection failed:');
    console.error(error.message);
  }
}

// 运行测试
testOpenAIConnectivity();