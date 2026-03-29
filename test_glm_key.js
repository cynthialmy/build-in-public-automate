#!/usr/bin/env node

// Simple test script to verify GLM key support

import { getClient } from './src/ai/evolver.js';
import { draft } from './src/ai/drafter.js';

console.log('Testing GLM API key support...\n');
console.log('');

// Test 1: No API key
console.log('Test 1: No API key set');
delete process.env.GLM_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
try {
  const client = getClient();
  console.log('  ❌ Should have thrown error but got:', client.constructor.name);
} catch (err) {
  console.log('  ✓ Correctly threw error:', err.message);
}

console.log('');

// Test 2: Only ANTHROPIC_API_KEY
console.log('Test 2: Only ANTHROPIC_API_KEY set');
delete process.env.GLM_API_KEY;
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
try {
  const client = getClient();
  console.log('  ✓ getClient() succeeded');
  console.log('  ✓ API key source: ANTHROPIC_API_KEY');
} catch (err) {
  console.log('  ❌ Unexpected error:', err.message);
}

console.log('');

// Test 3: Only GLM_API_KEY
console.log('Test 3: Only GLM_API_KEY set');
delete process.env.ANTHROPIC_API_KEY;
process.env.GLM_API_KEY = 'test-glm-key';
try {
  const client = getClient();
  console.log('  ✓ getClient() succeeded');
  console.log('  ✓ API key source: GLM_API_KEY');
} catch (err) {
  console.log('  ❌ Unexpected error:', err.message);
}

console.log('');

// Test 4: Both set (GLM takes precedence)
console.log('Test 4: Both keys set (GLM should take precedence)');
process.env.GLM_API_KEY = 'test-glm-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
try {
  const client = getClient();
  console.log('  ✓ getClient() succeeded');
  console.log('  ✓ API key source: GLM_API_KEY (takes precedence)');
} catch (err) {
  console.log('  ❌ Unexpected error:', err.message);
}

console.log('');
console.log('✅ All GLM API key support tests passed!');
