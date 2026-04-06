const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 读取配置文件
const configPath = path.join(__dirname, '..', '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 提取Anthropic配置
const anthropicConfig = config.anthropic;

console.log('Testing Claude connectivity...');
console.log('Configuration:');
console.log('- Enabled:', anthropicConfig.enabled);
console.log('- Provider:', anthropicConfig.provider);
console.log('- CLI Path:', anthropicConfig.cli_path);
console.log('- Model:', anthropicConfig.model || 'Not set');
console.log('- Timeout (ms):', anthropicConfig.timeout_ms);
console.log('- JSON Strict:', anthropicConfig.json_strict);

// 测试Claude CLI连通性
async function testClaudeConnectivity() {
  try {
    const cliPath = anthropicConfig.cli_path || 'claude';
    
    // 测试CLI是否存在
    const testArgs = ['--help'];
    
    return new Promise((resolve, reject) => {
      const child = spawn(cliPath, testArgs, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data;
      });

      child.stderr.on('data', (data) => {
        stderr += data;
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Claude CLI is available!');
          console.log('CLI output:');
          console.log(stdout.slice(0, 500) + (stdout.length > 500 ? '...' : ''));
          resolve();
        } else {
          console.error('\n❌ Claude CLI is not available:');
          console.error(`Exit code: ${code}`);
          console.error(`Error: ${stderr || 'No error message'}`);
          reject(new Error(`Claude CLI error (exit code ${code}): ${stderr || 'no error message'}`));
        }
      });

      child.on('error', (err) => {
        console.error('\n❌ Failed to spawn Claude CLI:');
        console.error(err.message);
        reject(new Error(`Claude CLI spawn error: ${err.message}`));
      });

      // 关闭标准输入
      child.stdin.end();
    });

  } catch (error) {
    console.error('\n❌ Connection failed:');
    console.error(error.message);
  }
}

// 运行测试
testClaudeConnectivity();