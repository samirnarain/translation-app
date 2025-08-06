const fetch = require('node-fetch');

async function testTranslation() {
    const testCases = [
        { text: "Hello", target: "es", expected: "Hola" },
        { text: "How are you doing", target: "nl", expected: "hoe gaat het" },
        { text: "Thank you", target: "fr", expected: "merci" },
        { text: "Good morning", target: "de", expected: "guten morgen" }
    ];

    console.log('🧪 Testing LibreTranslate Integration...\n');

    for (const testCase of testCases) {
        try {
            console.log(`Testing: "${testCase.text}" -> ${testCase.target}`);
            
            const response = await fetch('http://localhost:3000/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: testCase.text,
                    source: 'en',
                    target: testCase.target,
                    format: 'text',
                    alternatives: 3
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`✅ Success: "${testCase.text}" -> "${data.translatedText}"`);
            console.log(`   Alternatives: ${data.alternatives ? data.alternatives.join(', ') : 'None'}`);
            console.log('');

        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            console.log('');
        }
    }

    // Test statistics endpoint
    try {
        const statsResponse = await fetch('http://localhost:3000/translation-stats');
        const stats = await statsResponse.json();
        console.log('📊 Translation Statistics:');
        console.log(`   Total Requests: ${stats.totalRequests}`);
        console.log(`   Successful: ${stats.successfulTranslations}`);
        console.log(`   Failed: ${stats.failedTranslations}`);
        console.log(`   Success Rate: ${stats.successRate}`);
        console.log(`   Cache Size: ${stats.cacheSize}`);
        console.log(`   Average Response Time: ${stats.averageResponseTime}ms`);
    } catch (error) {
        console.log(`❌ Could not fetch statistics: ${error.message}`);
    }
}

// Check if server is running
async function checkServer() {
    try {
        const response = await fetch('http://localhost:3000/health');
        const health = await response.json();
        console.log('🏥 Server Health Check:');
        console.log(`   Status: ${health.status}`);
        console.log(`   Connected Clients: ${health.clients}`);
        console.log(`   Uptime: ${health.uptime.toFixed(2)}s`);
        console.log('');
        return true;
    } catch (error) {
        console.log('❌ Server not running. Please start the server first:');
        console.log('   cd socket-version && npm start');
        return false;
    }
}

async function main() {
    console.log('🚀 LibreTranslate Integration Test\n');
    
    const serverRunning = await checkServer();
    if (!serverRunning) {
        process.exit(1);
    }

    await testTranslation();
    console.log('✅ Test completed!');
}

main().catch(console.error); 